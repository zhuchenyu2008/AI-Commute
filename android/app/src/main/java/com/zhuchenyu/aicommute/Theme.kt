package com.zhuchenyu.aicommute

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val BrandBlue = Color(0xFF2563EB)
val BrandBlueDeep = Color(0xFF004AC6)
val AppBackground = Color(0xFFF7F9FB)
val AppInk = Color(0xFF191C1E)
val AppMuted = Color(0xFF5E6270)
val AppLine = Color(0xFFD8DEEA)
val AppSoftBlue = Color(0xFFEAF1FF)
val AppSoftSlate = Color(0xFFF1F4F8)

private val AICommuteColors = lightColorScheme(
    primary = BrandBlue,
    onPrimary = Color.White,
    primaryContainer = AppSoftBlue,
    onPrimaryContainer = Color(0xFF173D8E),
    secondary = Color(0xFF52657F),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE8EEF7),
    onSecondaryContainer = Color(0xFF2A3A50),
    tertiary = Color(0xFF56658E),
    background = AppBackground,
    onBackground = AppInk,
    surface = Color.White,
    onSurface = AppInk,
    surfaceVariant = AppSoftSlate,
    onSurfaceVariant = AppMuted,
    outline = AppLine,
    outlineVariant = Color(0xFFE8ECF2),
    error = Color(0xFFBA1A1A),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
)

private val AICommuteTypography = Typography(
    displaySmall = TextStyle(
        fontSize = 34.sp,
        lineHeight = 39.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.6).sp,
    ),
    headlineMedium = TextStyle(
        fontSize = 28.sp,
        lineHeight = 34.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.35).sp,
    ),
    headlineSmall = TextStyle(
        fontSize = 23.sp,
        lineHeight = 29.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.2).sp,
    ),
    titleLarge = TextStyle(
        fontSize = 21.sp,
        lineHeight = 27.sp,
        fontWeight = FontWeight.Bold,
    ),
    titleMedium = TextStyle(
        fontSize = 17.sp,
        lineHeight = 23.sp,
        fontWeight = FontWeight.SemiBold,
    ),
    bodyLarge = TextStyle(
        fontSize = 16.sp,
        lineHeight = 23.sp,
        fontWeight = FontWeight.Normal,
    ),
    bodyMedium = TextStyle(
        fontSize = 14.sp,
        lineHeight = 20.sp,
        fontWeight = FontWeight.Normal,
    ),
    labelLarge = TextStyle(
        fontSize = 14.sp,
        lineHeight = 19.sp,
        fontWeight = FontWeight.SemiBold,
    ),
    labelMedium = TextStyle(
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.15.sp,
    ),
)

private val AICommuteShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(26.dp),
    extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(32.dp),
)

@Composable
fun AICommuteTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AICommuteColors,
        typography = AICommuteTypography,
        shapes = AICommuteShapes,
        content = content,
    )
}
