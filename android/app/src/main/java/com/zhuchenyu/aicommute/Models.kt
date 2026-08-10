package com.zhuchenyu.aicommute

data class AppSettings(
    val defaultCity: String = "宁波",
    val defaultOrigin: String = "",
    val commutePreferences: String = "优先经济实惠，其次准时；合理考虑天气与步行距离",
    val routeChangeThresholdMinutes: Int = 8,
    val emailRecipient: String = "",
    val openAiBaseUrl: String = "https://api.openai.com/v1",
    val openAiModel: String = "",
    val openAiKey: String = "",
    val amapKey: String = "",
    val smtpHost: String = "",
    val smtpPort: Int = 587,
    val smtpUser: String = "",
    val smtpPassword: String = "",
    val smtpFrom: String = "",
    val smtpSecure: Boolean = false,
) {
    val coreConfigured: Boolean
        get() = openAiBaseUrl.isNotBlank() &&
            openAiModel.isNotBlank() &&
            openAiKey.isNotBlank() &&
            amapKey.isNotBlank()

    val emailConfigured: Boolean
        get() = emailRecipient.isNotBlank() &&
            smtpHost.isNotBlank() &&
            smtpUser.isNotBlank() &&
            smtpPassword.isNotBlank() &&
            smtpFrom.isNotBlank()
}

data class PlannedSegment(
    val mode: String,
    val from: String,
    val to: String,
    val instruction: String,
    val estimatedMinutes: Int,
)

data class AiPlan(
    val title: String,
    val destination: String,
    val arrivalIso: String,
    val bufferMinutes: Int,
    val reasoning: String,
    val segments: List<PlannedSegment>,
    val memoryCandidates: List<String>,
)

data class RouteResult(
    val durationMinutes: Int,
    val distanceMeters: Int,
    val instruction: String,
)

data class GeoPoint(
    val name: String,
    val lng: Double,
    val lat: Double,
) {
    val lngLat: String get() = "$lng,$lat"
}

data class DeviceLocation(
    val point: GeoPoint?,
    val label: String,
)

data class WeatherInfo(
    val city: String,
    val weather: String,
    val temperature: String,
    val wind: String,
) {
    val summary: String
        get() = listOf(
            weather,
            temperature.takeIf { it.isNotBlank() }?.let { "${it}℃" },
            wind.takeIf { it.isNotBlank() }
        ).filterNotNull().joinToString(" · ")
}

enum class HomeTab { HOME, HISTORY, MEMORIES, SETTINGS }
