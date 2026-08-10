package com.zhuchenyu.aicommute

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max

object NotificationHelper {
    private const val CHANNEL = "ai_commute_v2"
    private const val CHANNEL_NAME = "AI Commute 行程提醒"
    private val VIBRATION_PATTERN = longArrayOf(0, 70, 65, 120)

    fun ensureChannel(context: Context) {
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "出发提醒与路线重大变化"
                enableVibration(true)
                vibrationPattern = VIBRATION_PATTERN
            }
            manager.createNotificationChannel(channel)
        }
    }

    fun notify(context: Context, id: Int, title: String, text: String) {
        ensureChannel(context)
        if (
            android.os.Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) return

        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_map)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVibrate(VIBRATION_PATTERN)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(id, notification)
    }
}

object TripScheduler {
    fun schedule(context: Context, trip: TripEntity) {
        val manager = WorkManager.getInstance(context)
        val reminderDelay = max(0L, trip.departureEpochMillis - System.currentTimeMillis())
        val input = Data.Builder().putString("tripId", trip.id).build()

        val reminder = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInputData(input)
            .setInitialDelay(reminderDelay, TimeUnit.MILLISECONDS)
            .setConstraints(
                Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            )
            .build()
        manager.enqueueUniqueWork(
            "trip-reminder-${trip.id}",
            ExistingWorkPolicy.REPLACE,
            reminder
        )

        val monitor = PeriodicWorkRequestBuilder<RouteMonitorWorker>(15, TimeUnit.MINUTES)
            .setInputData(input)
            .setConstraints(
                Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            )
            .build()
        manager.enqueueUniquePeriodicWork(
            "trip-monitor-${trip.id}",
            ExistingPeriodicWorkPolicy.UPDATE,
            monitor
        )
    }

    fun cancel(context: Context, tripId: String) {
        val manager = WorkManager.getInstance(context)
        manager.cancelUniqueWork("trip-reminder-$tripId")
        manager.cancelUniqueWork("trip-monitor-$tripId")
    }
}

class ReminderWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val tripId = inputData.getString("tripId") ?: return Result.failure()
        val db = AppDatabase.get(applicationContext)
        val trip = db.trips().getById(tripId) ?: return Result.success()
        if (trip.status != "active") return Result.success()

        val departure = formatTime(trip.departureEpochMillis)
        val text = "建议现在出发 · 预计 ${trip.routeDurationMinutes} 分钟 · ${trip.destination}"
        NotificationHelper.notify(applicationContext, trip.id.hashCode(), trip.title, text)

        val settings = SettingsStore(applicationContext).load()
        runCatching {
            EmailSender.send(
                settings,
                "AI Commute 出发提醒：${trip.title}",
                """
                    $text
                    最晚出发：$departure
                    缓冲：${trip.bufferMinutes} 分钟
                    天气：${trip.weatherSummary.ifBlank { "暂无" }}
                """.trimIndent()
            )
        }
        return Result.success()
    }
}

class RouteMonitorWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val tripId = inputData.getString("tripId") ?: return Result.failure()
        val db = AppDatabase.get(applicationContext)
        val trip = db.trips().getById(tripId) ?: return Result.success()
        if (trip.status != "active" || !trip.monitorEnabled) return Result.success()

        if (System.currentTimeMillis() > trip.arrivalEpochMillis) {
            db.trips().setStatus(tripId, "completed", false, System.currentTimeMillis())
            TripScheduler.cancel(applicationContext, tripId)
            return Result.success()
        }

        val settings = SettingsStore(applicationContext).load()
        if (!settings.coreConfigured) return Result.retry()
        val amap = AMapClient(settings.amapKey)
        val segments = db.segments().getForTrip(tripId)
        var updatedTotal = 0
        var usable = 0

        segments.forEach { segment ->
            val olng = segment.originLng
            val olat = segment.originLat
            val dlng = segment.destinationLng
            val dlat = segment.destinationLat
            if (olng == null || olat == null || dlng == null || dlat == null) {
                updatedTotal += segment.durationMinutes
                return@forEach
            }
            val route = runCatching {
                amap.route(
                    segment.mode,
                    GeoPoint(segment.fromName, olng, olat),
                    GeoPoint(segment.toName, dlng, dlat),
                    settings.defaultCity
                )
            }.getOrNull()
            if (route != null) {
                updatedTotal += route.durationMinutes
                usable++
            } else {
                updatedTotal += segment.durationMinutes
            }
        }

        if (usable == 0) return Result.success()
        val delta = updatedTotal - trip.routeDurationMinutes
        if (abs(delta) >= trip.routeChangeThresholdMinutes) {
            val newDeparture = trip.arrivalEpochMillis -
                (updatedTotal + trip.bufferMinutes) * 60_000L
            db.trips().updateTiming(tripId, updatedTotal, newDeparture, System.currentTimeMillis())

            val direction = if (delta > 0) "增加" else "减少"
            val text = "路线预计耗时${direction} ${abs(delta)} 分钟，新的建议出发时间 ${formatTime(newDeparture)}"
            NotificationHelper.notify(
                applicationContext,
                trip.id.hashCode() xor 0x45A1,
                "路线发生重要变化",
                text
            )
            runCatching {
                EmailSender.send(
                    settings,
                    "AI Commute 路线变化：${trip.title}",
                    "$text\n目的地：${trip.destination}"
                )
            }
        }
        return Result.success()
    }
}

fun formatTime(epochMillis: Long): String {
    val formatter = DateTimeFormatter.ofPattern("MM月dd日 HH:mm")
    return Instant.ofEpochMilli(epochMillis)
        .atZone(ZoneId.of("Asia/Shanghai"))
        .format(formatter)
}
