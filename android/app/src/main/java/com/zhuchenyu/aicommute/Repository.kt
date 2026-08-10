package com.zhuchenyu.aicommute

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.UUID

data class TripDetail(
    val trip: TripEntity,
    val segments: List<SegmentEntity>,
)

class TripRepository(private val context: Context) {
    private val db = AppDatabase.get(context)
    private val settingsStore = SettingsStore(context)

    val trips: Flow<List<TripEntity>> = db.trips().observeAll()
    val memories: Flow<List<MemoryEntity>> = db.memories().observeAll()

    fun loadSettings(): AppSettings = settingsStore.load()

    fun saveSettings(settings: AppSettings) {
        settingsStore.save(settings)
    }

    suspend fun weather(): WeatherInfo? = withContext(Dispatchers.IO) {
        val settings = settingsStore.load()
        if (settings.amapKey.isBlank()) return@withContext null
        runCatching { AMapClient(settings.amapKey).weather(settings.defaultCity) }.getOrNull()
    }

    suspend fun resolveDeviceLocation(): DeviceLocation? = withContext(Dispatchers.IO) {
        val settings = settingsStore.load()
        val raw = DeviceLocationProvider.current(context) ?: return@withContext null
        if (settings.amapKey.isBlank()) {
            return@withContext DeviceLocation(
                point = GeoPoint("当前位置", raw.longitude, raw.latitude),
                label = "当前位置"
            )
        }
        val point = runCatching {
            AMapClient(settings.amapKey).reverseGeocode(raw.longitude, raw.latitude)
        }.getOrNull() ?: GeoPoint("当前位置", raw.longitude, raw.latitude)
        DeviceLocation(point, point.name)
    }

    suspend fun planTrip(
        requestText: String,
        currentLocation: DeviceLocation?,
    ): TripDetail = withContext(Dispatchers.IO) {
        require(requestText.isNotBlank()) { "请输入出行需求" }
        val settings = settingsStore.load()
        require(settings.coreConfigured) { "请先在设置中填写 AI 与高德 API 配置" }

        val amap = AMapClient(settings.amapKey)
        val weather = runCatching { amap.weather(settings.defaultCity) }.getOrNull()
        val acceptedMemories = db.memories().accepted()
        val aiPlan = OpenAiClient(settings).plan(
            requestText = requestText,
            weather = weather,
            acceptedMemories = acceptedMemories,
            currentLocation = currentLocation,
        )

        val tripId = UUID.randomUUID().toString()
        val segmentEntities = mutableListOf<SegmentEntity>()
        var totalMinutes = 0

        aiPlan.segments.forEachIndexed { index, planned ->
            val fromName = planned.from.ifBlank {
                if (index == 0) settings.defaultOrigin.ifBlank { "当前位置" }
                else aiPlan.segments[index - 1].to
            }
            val toName = planned.to.ifBlank {
                if (index == aiPlan.segments.lastIndex) aiPlan.destination else "下一站"
            }

            val origin = when {
                fromName.contains("当前位置") && currentLocation?.point != null -> currentLocation.point
                index == 0 && settings.defaultOrigin.isNotBlank() &&
                    fromName.contains("当前位置") -> amap.geocode(settings.defaultOrigin, settings.defaultCity)
                else -> amap.geocode(fromName, settings.defaultCity)
            }
            val destination = amap.geocode(toName, settings.defaultCity)

            val route = if (origin != null && destination != null) {
                runCatching {
                    amap.route(planned.mode, origin, destination, settings.defaultCity)
                }.getOrNull()
            } else null

            val minutes = route?.durationMinutes ?: planned.estimatedMinutes.coerceAtLeast(1)
            totalMinutes += minutes
            segmentEntities += SegmentEntity(
                id = UUID.randomUUID().toString(),
                tripId = tripId,
                sequence = index,
                mode = planned.mode,
                fromName = fromName,
                toName = toName,
                durationMinutes = minutes,
                distanceMeters = route?.distanceMeters ?: 0,
                instruction = route?.instruction?.takeIf { it.isNotBlank() } ?: planned.instruction,
                originLng = origin?.lng,
                originLat = origin?.lat,
                destinationLng = destination?.lng,
                destinationLat = destination?.lat,
            )
        }

        val zone = ZoneId.of("Asia/Shanghai")
        val arrival = parseArrival(aiPlan.arrivalIso, zone)
        val departure = arrival.minusMinutes((totalMinutes + aiPlan.bufferMinutes).toLong())
        val now = System.currentTimeMillis()
        val first = segmentEntities.first()
        val last = segmentEntities.last()

        val trip = TripEntity(
            id = tripId,
            title = aiPlan.title,
            requestText = requestText,
            destination = aiPlan.destination,
            arrivalEpochMillis = arrival.toInstant().toEpochMilli(),
            departureEpochMillis = departure.toInstant().toEpochMilli(),
            status = "active",
            routeDurationMinutes = totalMinutes,
            bufferMinutes = aiPlan.bufferMinutes,
            weatherSummary = weather?.summary.orEmpty(),
            reasoning = aiPlan.reasoning,
            createdAt = now,
            updatedAt = now,
            monitorEnabled = true,
            routeChangeThresholdMinutes = settings.routeChangeThresholdMinutes,
            originName = first.fromName,
            originLng = first.originLng,
            originLat = first.originLat,
            destinationLng = last.destinationLng,
            destinationLat = last.destinationLat,
        )

        db.trips().upsert(trip)
        db.segments().deleteForTrip(tripId)
        db.segments().insertAll(segmentEntities)

        aiPlan.memoryCandidates.distinct().take(5).forEach { candidate ->
            db.memories().upsert(
                MemoryEntity(
                    id = UUID.randomUUID().toString(),
                    content = candidate,
                    source = "AI 规划候选",
                    status = "pending",
                    createdAt = now,
                )
            )
        }

        TripScheduler.schedule(context, trip)
        TripDetail(trip, segmentEntities)
    }

    suspend fun tripDetail(id: String): TripDetail? = withContext(Dispatchers.IO) {
        val trip = db.trips().getById(id) ?: return@withContext null
        TripDetail(trip, db.segments().getForTrip(id))
    }

    suspend fun cancelTrip(id: String) = withContext(Dispatchers.IO) {
        db.trips().setStatus(id, "cancelled", false, System.currentTimeMillis())
        TripScheduler.cancel(context, id)
    }

    suspend fun acceptMemory(id: String) = withContext(Dispatchers.IO) {
        db.memories().setStatus(id, "accepted")
    }

    suspend fun rejectMemory(id: String) = withContext(Dispatchers.IO) {
        db.memories().setStatus(id, "rejected")
    }

    suspend fun deleteMemory(id: String) = withContext(Dispatchers.IO) {
        db.memories().delete(id)
    }

    private fun parseArrival(raw: String, zone: ZoneId): ZonedDateTime {
        if (raw.isNotBlank()) {
            runCatching { return ZonedDateTime.parse(raw).withZoneSameInstant(zone) }
            runCatching {
                return java.time.LocalDateTime.parse(raw).atZone(zone)
            }
        }
        return ZonedDateTime.now(zone).plusMinutes(60)
    }
}
