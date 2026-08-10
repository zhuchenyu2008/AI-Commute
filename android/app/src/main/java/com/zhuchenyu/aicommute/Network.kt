package com.zhuchenyu.aicommute

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Properties
import javax.mail.Authenticator
import javax.mail.Message
import javax.mail.PasswordAuthentication
import javax.mail.Session
import javax.mail.Transport
import javax.mail.internet.InternetAddress
import javax.mail.internet.MimeMessage
import kotlin.math.ceil

object HttpJson {
    fun get(baseUrl: String, params: Map<String, String>): JSONObject {
        val query = params.entries.joinToString("&") {
            "${encode(it.key)}=${encode(it.value)}"
        }
        return request("GET", if (query.isBlank()) baseUrl else "$baseUrl?$query")
    }

    fun post(url: String, headers: Map<String, String>, body: JSONObject): JSONObject {
        return request("POST", url, headers, body.toString())
    }

    private fun request(
        method: String,
        url: String,
        headers: Map<String, String> = emptyMap(),
        body: String? = null,
    ): JSONObject {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 20_000
            readTimeout = 45_000
            setRequestProperty("Accept", "application/json")
            headers.forEach { (k, v) -> setRequestProperty(k, v) }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
        }

        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.use {
            BufferedReader(InputStreamReader(it, Charsets.UTF_8)).readText()
        }.orEmpty()
        connection.disconnect()

        if (status !in 200..299) {
            throw IllegalStateException("HTTP $status: ${text.take(500)}")
        }
        if (text.isBlank()) return JSONObject()
        return JSONObject(text)
    }

    private fun encode(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8.name())
}

class OpenAiClient(private val settings: AppSettings) {
    fun plan(
        requestText: String,
        weather: WeatherInfo?,
        acceptedMemories: List<MemoryEntity>,
        currentLocation: DeviceLocation?,
    ): AiPlan {
        val memoryText = acceptedMemories.joinToString("\n") { "- ${it.content}" }
        val now = java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Shanghai"))

        val system = """
            你是 AI Commute 的通勤规划 Agent。当前时区固定为 Asia/Shanghai（北京时间）。
            你需要把用户的自然语言出行需求转换成可执行的结构化行程。
            当前北京时间：$now
            默认城市：${settings.defaultCity}
            默认出发点：${settings.defaultOrigin.ifBlank { "未设置" }}
            用户偏好：${settings.commutePreferences}
            当前定位：${currentLocation?.label ?: "未提供"}
            天气：${weather?.summary ?: "未知"}
            已接受的通勤记忆：
            ${memoryText.ifBlank { "- 暂无" }}

            只返回一个 JSON 对象，不要 Markdown、不要代码块、不要额外解释。
            JSON schema:
            {
              "title": "简短行程标题",
              "destination": "最终目的地",
              "arrival_time": "ISO-8601 时间，必须包含 +08:00",
              "buffer_minutes": 10,
              "reasoning": "简短说明路线与缓冲的依据",
              "segments": [
                {
                  "mode": "walking|transit|driving|bicycling|taxi",
                  "from": "起点名称，可使用‘当前位置’",
                  "to": "终点名称",
                  "instruction": "该段说明",
                  "estimated_minutes": 10
                }
              ],
              "memory_candidates": ["值得长期记住的稳定偏好；没有就空数组"]
            }
            如果用户只说‘几点出发’而没有明确到达时间，请结合语义推断合理到达时间；
            无法可靠推断时，把 arrival_time 设为当前北京时间之后 60 分钟。
            segments 至少 1 段。不要虚构具体公交线路号，除非用户明确提供。
        """.trimIndent()

        val body = JSONObject().apply {
            put("model", settings.openAiModel)
            put("temperature", 0.2)
            put("messages", JSONArray().apply {
                put(JSONObject().put("role", "system").put("content", system))
                put(JSONObject().put("role", "user").put("content", requestText))
            })
        }

        val response = HttpJson.post(
            settings.openAiBaseUrl.trimEnd('/') + "/chat/completions",
            mapOf("Authorization" to "Bearer ${settings.openAiKey}"),
            body
        )

        val content = response
            .getJSONArray("choices")
            .getJSONObject(0)
            .getJSONObject("message")
            .optString("content")
        val jsonText = extractJsonObject(content)
        val root = JSONObject(jsonText)

        val segmentsJson = root.optJSONArray("segments") ?: JSONArray()
        val segments = buildList {
            for (i in 0 until segmentsJson.length()) {
                val item = segmentsJson.optJSONObject(i) ?: continue
                add(
                    PlannedSegment(
                        mode = item.optString("mode", "transit"),
                        from = item.optString("from", "当前位置"),
                        to = item.optString("to", root.optString("destination")),
                        instruction = item.optString("instruction", ""),
                        estimatedMinutes = item.optInt("estimated_minutes", 10).coerceAtLeast(1),
                    )
                )
            }
        }.ifEmpty {
            listOf(
                PlannedSegment(
                    mode = "transit",
                    from = if (settings.defaultOrigin.isBlank()) "当前位置" else settings.defaultOrigin,
                    to = root.optString("destination", "目的地"),
                    instruction = "按实时路线前往目的地",
                    estimatedMinutes = 30
                )
            )
        }

        val memoryCandidatesJson = root.optJSONArray("memory_candidates") ?: JSONArray()
        val candidates = buildList {
            for (i in 0 until memoryCandidatesJson.length()) {
                memoryCandidatesJson.optString(i).takeIf { it.isNotBlank() }?.let(::add)
            }
        }

        return AiPlan(
            title = root.optString("title", "新的通勤行程"),
            destination = root.optString("destination", segments.last().to),
            arrivalIso = root.optString("arrival_time"),
            bufferMinutes = root.optInt("buffer_minutes", 10).coerceIn(0, 120),
            reasoning = root.optString("reasoning", ""),
            segments = segments,
            memoryCandidates = candidates,
        )
    }

    private fun extractJsonObject(raw: String): String {
        val trimmed = raw.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
        val start = trimmed.indexOf('{')
        val end = trimmed.lastIndexOf('}')
        if (start < 0 || end <= start) error("AI 返回内容不是 JSON 对象")
        return trimmed.substring(start, end + 1)
    }
}

class AMapClient(private val key: String) {
    fun geocode(name: String, city: String): GeoPoint? {
        if (name.isBlank()) return null
        val root = HttpJson.get(
            "https://restapi.amap.com/v3/geocode/geo",
            mapOf("key" to key, "address" to name, "city" to city)
        )
        val item = root.optJSONArray("geocodes")?.optJSONObject(0) ?: return null
        val parts = item.optString("location").split(",")
        if (parts.size != 2) return null
        return GeoPoint(
            name = item.optString("formatted_address", name),
            lng = parts[0].toDoubleOrNull() ?: return null,
            lat = parts[1].toDoubleOrNull() ?: return null
        )
    }

    fun reverseGeocode(lng: Double, lat: Double): GeoPoint? {
        val root = HttpJson.get(
            "https://restapi.amap.com/v3/geocode/regeo",
            mapOf(
                "key" to key,
                "location" to "$lng,$lat",
                "extensions" to "base",
                "radius" to "500"
            )
        )
        val regeocode = root.optJSONObject("regeocode") ?: return null
        val address = regeocode.optString("formatted_address", "当前位置")
        return GeoPoint(address, lng, lat)
    }

    fun weather(city: String): WeatherInfo? {
        val root = HttpJson.get(
            "https://restapi.amap.com/v3/weather/weatherInfo",
            mapOf("key" to key, "city" to city, "extensions" to "base")
        )
        val item = root.optJSONArray("lives")?.optJSONObject(0) ?: return null
        return WeatherInfo(
            city = item.optString("city", city),
            weather = item.optString("weather"),
            temperature = item.optString("temperature"),
            wind = listOf(
                item.optString("winddirection").takeIf { it.isNotBlank() }?.let { "${it}风" },
                item.optString("windpower").takeIf { it.isNotBlank() }?.let { "${it}级" }
            ).filterNotNull().joinToString("")
        )
    }

    fun route(mode: String, origin: GeoPoint, destination: GeoPoint, city: String): RouteResult? {
        return when (mode.lowercase()) {
            "walking", "walk" -> walking(origin, destination)
            "driving", "car", "taxi" -> driving(origin, destination)
            "bicycling", "bicycle", "bike", "cycling" -> bicycling(origin, destination)
            else -> transit(origin, destination, city) ?: driving(origin, destination)
        }
    }

    private fun driving(origin: GeoPoint, destination: GeoPoint): RouteResult? {
        val root = HttpJson.get(
            "https://restapi.amap.com/v3/direction/driving",
            mapOf(
                "key" to key,
                "origin" to origin.lngLat,
                "destination" to destination.lngLat,
                "extensions" to "base",
                "strategy" to "0"
            )
        )
        val path = root.optJSONObject("route")
            ?.optJSONArray("paths")
            ?.optJSONObject(0) ?: return null
        return parsePath(path)
    }

    private fun walking(origin: GeoPoint, destination: GeoPoint): RouteResult? {
        val root = HttpJson.get(
            "https://restapi.amap.com/v3/direction/walking",
            mapOf("key" to key, "origin" to origin.lngLat, "destination" to destination.lngLat)
        )
        val path = root.optJSONObject("route")
            ?.optJSONArray("paths")
            ?.optJSONObject(0) ?: return null
        return parsePath(path)
    }

    private fun bicycling(origin: GeoPoint, destination: GeoPoint): RouteResult? {
        val root = HttpJson.get(
            "https://restapi.amap.com/v4/direction/bicycling",
            mapOf("key" to key, "origin" to origin.lngLat, "destination" to destination.lngLat)
        )
        val path = root.optJSONObject("data")
            ?.optJSONArray("paths")
            ?.optJSONObject(0) ?: return null
        return parsePath(path)
    }

    private fun transit(origin: GeoPoint, destination: GeoPoint, city: String): RouteResult? {
        val root = HttpJson.get(
            "https://restapi.amap.com/v3/direction/transit/integrated",
            mapOf(
                "key" to key,
                "origin" to origin.lngLat,
                "destination" to destination.lngLat,
                "city" to city,
                "cityd" to city,
                "strategy" to "0",
                "nightflag" to "0"
            )
        )
        val transit = root.optJSONObject("route")
            ?.optJSONArray("transits")
            ?.optJSONObject(0) ?: return null
        val durationSeconds = transit.optString("duration").toDoubleOrNull()
            ?: transit.optJSONObject("cost")?.optString("duration")?.toDoubleOrNull()
            ?: return null
        val distance = transit.optString("distance").toIntOrNull() ?: 0
        return RouteResult(
            durationMinutes = ceil(durationSeconds / 60.0).toInt().coerceAtLeast(1),
            distanceMeters = distance,
            instruction = "按高德实时公共交通方案出行"
        )
    }

    private fun parsePath(path: JSONObject): RouteResult? {
        val durationSeconds = path.optString("duration").toDoubleOrNull() ?: return null
        val distance = path.optString("distance").toIntOrNull() ?: 0
        val steps = path.optJSONArray("steps")
        val instruction = if (steps != null && steps.length() > 0) {
            steps.optJSONObject(0)?.optString("instruction", "").orEmpty()
        } else ""
        return RouteResult(
            durationMinutes = ceil(durationSeconds / 60.0).toInt().coerceAtLeast(1),
            distanceMeters = distance,
            instruction = instruction
        )
    }
}

object EmailSender {
    fun send(settings: AppSettings, subject: String, body: String) {
        if (!settings.emailConfigured) return
        val props = Properties().apply {
            put("mail.smtp.host", settings.smtpHost)
            put("mail.smtp.port", settings.smtpPort.toString())
            put("mail.smtp.auth", "true")
            put("mail.smtp.connectiontimeout", "15000")
            put("mail.smtp.timeout", "20000")
            if (settings.smtpSecure) {
                put("mail.smtp.ssl.enable", "true")
            } else {
                put("mail.smtp.starttls.enable", "true")
            }
        }
        val session = Session.getInstance(props, object : Authenticator() {
            override fun getPasswordAuthentication(): PasswordAuthentication =
                PasswordAuthentication(settings.smtpUser, settings.smtpPassword)
        })
        val message = MimeMessage(session).apply {
            setFrom(InternetAddress(settings.smtpFrom))
            setRecipients(Message.RecipientType.TO, InternetAddress.parse(settings.emailRecipient))
            setSubject(subject, "UTF-8")
            setText(body, "UTF-8")
        }
        Transport.send(message)
    }
}
