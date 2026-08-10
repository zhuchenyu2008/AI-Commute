package com.zhuchenyu.aicommute

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val AICommuteColors = lightColorScheme(
    primary = Color(0xFF2563EB),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE8F0FF),
    onPrimaryContainer = Color(0xFF163B8F),
    background = Color(0xFFF7F8FA),
    onBackground = Color(0xFF191C1E),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF191C1E),
    surfaceVariant = Color(0xFFF0F2F5),
    onSurfaceVariant = Color(0xFF434655),
    outline = Color(0xFFD7DAE0),
)

@Composable
fun AICommuteTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AICommuteColors,
        content = content
    )
}
