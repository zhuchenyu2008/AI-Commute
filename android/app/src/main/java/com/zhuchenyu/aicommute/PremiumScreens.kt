package com.zhuchenyu.aicommute

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle

private enum class PremiumTab { HOME, HISTORY, MEMORIES, SETTINGS }

private val GlassWhite = Color.White.copy(alpha = 0.90f)
private val GlassBorder = Color.White.copy(alpha = 0.98f)
private val SoftGreen = Color(0xFFEAF7EF)
private val DeepGreen = Color(0xFF267447)
private val SoftRed = Color(0xFFFFEDED)

@Composable
fun PremiumAICommuteApp(vm: AppViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()

    PremiumBackdrop {
        if (!state.settings.coreConfigured) {
            PremiumSettingsEditor(
                settings = state.settings,
                firstSetup = true,
                onSave = vm::saveSettings,
            )
            return@PremiumBackdrop
        }

        state.selectedTrip?.let { detail ->
            PremiumTripDetailScreen(
                detail = detail,
                onBack = vm::closeTrip,
                onCancel = { vm.cancelTrip(detail.trip.id) },
            )
            return@PremiumBackdrop
        }

        var tab by rememberSaveable { mutableStateOf(PremiumTab.HOME) }
        val haptics = rememberAppHaptics()

        Scaffold(
            containerColor = Color.Transparent,
            bottomBar = {
                PremiumBottomBar(
                    selected = tab,
                    onSelect = { next ->
                        if (next != tab) haptics.tick()
                        tab = next
                    },
                )
            },
        ) { padding ->
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(bottom = padding.calculateBottomPadding()),
            ) {
                when (tab) {
                    PremiumTab.HOME -> PremiumHomeScreen(state, vm)
                    PremiumTab.HISTORY -> PremiumHistoryScreen(state.trips, vm::openTrip)
                    PremiumTab.MEMORIES -> PremiumMemoriesScreen(
                        memories = state.memories,
                        onAccept = vm::acceptMemory,
                        onReject = vm::rejectMemory,
                        onDelete = vm::deleteMemory,
                    )
                    PremiumTab.SETTINGS -> PremiumSettingsEditor(
                        settings = state.settings,
                        firstSetup = false,
                        onSave = vm::saveSettings,
                    )
                }
            }
        }
    }
}

@Composable
private fun PremiumBackdrop(content: @Composable BoxScope.() -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .background(AppBackground),
    ) {
        Canvas(Modifier.matchParentSize()) {
            val grid = Color(0xFFB8C4D8).copy(alpha = 0.15f)
            val accent = Color(0xFFBFD4FF).copy(alpha = 0.24f)

            var y = 32.dp.toPx()
            while (y < size.height * 0.78f) {
                drawLine(grid, Offset(0f, y), Offset(size.width, y + 16.dp.toPx()), 1.dp.toPx())
                y += 70.dp.toPx()
            }

            var x = 24.dp.toPx()
            while (x < size.width) {
                drawLine(grid, Offset(x, 0f), Offset(x + 32.dp.toPx(), size.height * 0.70f), 1.dp.toPx())
                x += 92.dp.toPx()
            }

            drawLine(
                accent,
                Offset(-35.dp.toPx(), size.height * 0.16f),
                Offset(size.width * 0.74f, size.height * 0.05f),
                10.dp.toPx(),
            )
            drawLine(
                accent.copy(alpha = 0.14f),
                Offset(size.width * 0.55f, size.height * 0.10f),
                Offset(size.width + 60.dp.toPx(), size.height * 0.32f),
                13.dp.toPx(),
            )
        }

        Box(
            Modifier
                .fillMaxWidth()
                .height(240.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, AppBackground.copy(alpha = 0.96f), AppBackground),
                    ),
                ),
        )
        content()
    }
}

@Composable
private fun PremiumBottomBar(selected: PremiumTab, onSelect: (PremiumTab) -> Unit) {
    data class Item(val tab: PremiumTab, val label: String, val icon: ImageVector)
    val items = listOf(
        Item(PremiumTab.HOME, "首页", Icons.Default.Home),
        Item(PremiumTab.HISTORY, "历史", Icons.Default.History),
        Item(PremiumTab.MEMORIES, "记忆", Icons.Default.Psychology),
        Item(PremiumTab.SETTINGS, "设置", Icons.Default.Settings),
    )

    Surface(
        modifier = Modifier
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .fillMaxWidth()
            .shadow(15.dp, RoundedCornerShape(30.dp)),
        color = Color.White.copy(alpha = 0.92f),
        shape = RoundedCornerShape(30.dp),
        border = BorderStroke(1.dp, GlassBorder),
    ) {
        Row(
            Modifier.padding(7.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            items.forEach { item ->
                val active = item.tab == selected
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(23.dp))
                        .background(if (active) BrandBlue else Color.Transparent)
                        .clickable { onSelect(item.tab) }
                        .padding(vertical = 10.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        item.icon,
                        contentDescription = item.label,
                        tint = if (active) Color.White else AppMuted,
                        modifier = Modifier.size(20.dp),
                    )
                    if (active) {
                        Spacer(Modifier.width(6.dp))
                        Text(item.label, color = Color.White, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

@Composable
private fun PremiumHomeScreen(state: AppUiState, vm: AppViewModel) {
    val context = LocalContext.current
    val haptics = rememberAppHaptics()
    var request by rememberSaveable { mutableStateOf("") }

    val locationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.any { it }) vm.refreshLocation()
    }
    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {}

    LaunchedEffect(Unit) {
        if (
            Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    fun locate() {
        haptics.tick()
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (fine || coarse) {
            vm.refreshLocation()
        } else {
            locationLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            )
        }
    }

    val locationName = state.currentLocation?.label
        ?: state.settings.defaultOrigin.ifBlank { state.settings.defaultCity }
    val activeTrip = state.trips.firstOrNull { it.status == "active" }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
        contentPadding = PaddingValues(20.dp, 14.dp, 20.dp, 28.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.LocationOn, null, tint = BrandBlue, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(
                            if (state.isLocating) "正在定位" else "当前位置",
                            color = AppMuted,
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        locationName,
                        style = MaterialTheme.typography.displaySmall,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                Column(horizontalAlignment = Alignment.End) {
                    VersionBadge()
                    Spacer(Modifier.height(8.dp))
                    Surface(
                        modifier = Modifier.clickable { locate() },
                        color = GlassWhite,
                        shape = CircleShape,
                        border = BorderStroke(1.dp, GlassBorder),
                    ) {
                        Box(Modifier.padding(11.dp), contentAlignment = Alignment.Center) {
                            if (state.isLocating) {
                                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Default.LocationOn, "重新定位", tint = BrandBlue, modifier = Modifier.size(19.dp))
                            }
                        }
                    }
                }
            }
        }

        item {
            PremiumWeatherCard(
                city = state.weather?.city ?: state.settings.defaultCity,
                summary = state.weather?.summary ?: "天气暂未获取",
                onRefresh = {
                    haptics.tick()
                    vm.refreshWeather()
                },
            )
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("你要去哪，几点到？", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "告诉 AI 目的地、到达时间和偏好，它会结合路线、天气与通勤记忆倒推出发时间。",
                    color = AppMuted,
                    style = MaterialTheme.typography.bodyMedium,
                )
                PremiumPromptBar(
                    value = request,
                    onValueChange = { request = it },
                    isPlanning = state.isPlanning,
                    onPlan = {
                        if (request.isNotBlank() && !state.isPlanning) {
                            haptics.confirm()
                            vm.plan(request)
                        }
                    },
                )
                Text(
                    "输入目的地、到达时间或完整通勤目标",
                    color = AppMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        state.error?.let { error ->
            item {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.90f),
                    shape = RoundedCornerShape(18.dp),
                ) {
                    Row(
                        Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(error, Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer)
                        IconButton(onClick = {
                            haptics.tick()
                            vm.clearError()
                        }) {
                            Icon(Icons.Default.Close, "关闭")
                        }
                    }
                }
            }
        }

        if (activeTrip != null) {
            item { PremiumSectionHeader("当前行程", "系统会持续关注重要路线变化") }
            item {
                PremiumTripCard(activeTrip, emphasized = true) {
                    haptics.select()
                    vm.openTrip(activeTrip.id)
                }
            }
        }

        if (state.trips.isNotEmpty()) {
            item { PremiumSectionHeader("最近行程", "保存在本机，不依赖 AI-Commute 后端") }
            items(state.trips.take(3), key = { it.id }) { trip ->
                PremiumTripCard(trip) {
                    haptics.select()
                    vm.openTrip(trip.id)
                }
            }
        }
    }
}

@Composable
private fun VersionBadge() {
    Surface(
        color = BrandBlue,
        shape = RoundedCornerShape(50),
        shadowElevation = 4.dp,
    ) {
        Text(
            "v1.1 · NATIVE",
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp,
        )
    }
}

@Composable
private fun PremiumWeatherCard(city: String, summary: String, onRefresh: () -> Unit) {
    PremiumGlassCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(color = AppSoftBlue, shape = CircleShape) {
                Icon(
                    Icons.Default.WbSunny,
                    null,
                    tint = BrandBlue,
                    modifier = Modifier.padding(11.dp).size(22.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(city, style = MaterialTheme.typography.titleMedium)
                Text(summary, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
            }
            IconButton(onClick = onRefresh) {
                Icon(Icons.Default.Refresh, "刷新天气", tint = AppMuted)
            }
        }
    }
}

@Composable
private fun PremiumPromptBar(
    value: String,
    onValueChange: (String) -> Unit,
    isPlanning: Boolean,
    onPlan: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(8.dp, RoundedCornerShape(30.dp)),
        color = Color.White.copy(alpha = 0.94f),
        shape = RoundedCornerShape(30.dp),
        border = BorderStroke(1.dp, Color.White),
    ) {
        Row(
            Modifier.padding(start = 16.dp, top = 8.dp, end = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.Search, null, tint = AppMuted, modifier = Modifier.size(21.dp))
            Spacer(Modifier.width(10.dp))
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.weight(1f),
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = AppInk),
                cursorBrush = SolidColor(BrandBlue),
                singleLine = true,
                decorationBox = { inner ->
                    Box {
                        if (value.isBlank()) {
                            Text("例如：五点前到外事学校，公交优先", color = AppMuted.copy(alpha = 0.70f))
                        }
                        inner()
                    }
                },
            )
            Spacer(Modifier.width(8.dp))
            Surface(
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable(enabled = value.isNotBlank() && !isPlanning) { onPlan() },
                color = if (value.isNotBlank()) BrandBlue else AppLine,
                shape = CircleShape,
                shadowElevation = if (value.isNotBlank()) 4.dp else 0.dp,
            ) {
                Box(
                    Modifier.size(50.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    if (isPlanning) {
                        CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                    } else {
                        Text("规划", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun PremiumSectionHeader(title: String, subtitle: String? = null) {
    Column {
        Text(title, style = MaterialTheme.typography.titleLarge)
        if (subtitle != null) {
            Spacer(Modifier.height(2.dp))
            Text(subtitle, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun PremiumTripCard(
    trip: TripEntity,
    emphasized: Boolean = false,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(if (emphasized) 12.dp else 5.dp, RoundedCornerShape(24.dp))
            .clickable { onClick() },
        color = if (emphasized) Color.White.copy(alpha = 0.96f) else GlassWhite,
        shape = RoundedCornerShape(24.dp),
        border = BorderStroke(1.dp, if (emphasized) Color(0xFFDCE7FF) else GlassBorder),
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(trip.title, style = MaterialTheme.typography.titleLarge, maxLines = 2)
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.LocationOn, null, tint = AppMuted, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(
                            trip.destination,
                            color = AppMuted,
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Spacer(Modifier.width(10.dp))
                PremiumStatusPill(trip.status)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PremiumMetric(
                    label = "建议出发",
                    value = formatTime(trip.departureEpochMillis),
                    modifier = Modifier.weight(1.35f),
                    accent = emphasized,
                )
                PremiumMetric(
                    label = "预计耗时",
                    value = "${trip.routeDurationMinutes} 分钟",
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun PremiumMetric(label: String, value: String, modifier: Modifier = Modifier, accent: Boolean = false) {
    Surface(
        modifier = modifier,
        color = if (accent) AppSoftBlue else AppSoftSlate.copy(alpha = 0.85f),
        shape = RoundedCornerShape(17.dp),
    ) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Text(label, color = AppMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(2.dp))
            Text(
                value,
                color = if (accent) BrandBlueDeep else AppInk,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
        }
    }
}

@Composable
private fun PremiumStatusPill(status: String) {
    val (label, bg, fg) = when (status) {
        "active" -> Triple("监控中", SoftGreen, DeepGreen)
        "completed" -> Triple("已完成", AppSoftSlate, AppMuted)
        "cancelled" -> Triple("已取消", SoftRed, MaterialTheme.colorScheme.error)
        else -> Triple(status, AppSoftSlate, AppMuted)
    }
    Surface(color = bg, shape = RoundedCornerShape(50)) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            color = fg,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun PremiumHistoryScreen(trips: List<TripEntity>, onOpen: (String) -> Unit) {
    val haptics = rememberAppHaptics()
    LazyColumn(
        modifier = Modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = PaddingValues(20.dp, 16.dp, 20.dp, 28.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        item {
            PremiumPageHeader(
                eyebrow = "TRIPS",
                title = "历史行程",
                subtitle = "所有记录只保存在这台手机。",
            )
        }
        if (trips.isEmpty()) {
            item { PremiumEmptyCard("还没有行程记录", "从首页生成第一条通勤方案后会出现在这里。") }
        } else {
            items(trips, key = { it.id }) { trip ->
                PremiumTripCard(trip) {
                    haptics.select()
                    onOpen(trip.id)
                }
            }
        }
    }
}

@Composable
private fun PremiumMemoriesScreen(
    memories: List<MemoryEntity>,
    onAccept: (String) -> Unit,
    onReject: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    val haptics = rememberAppHaptics()
    val pending = memories.filter { it.status == "pending" }
    val accepted = memories.filter { it.status == "accepted" }

    LazyColumn(
        modifier = Modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = PaddingValues(20.dp, 16.dp, 20.dp, 28.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        item {
            PremiumPageHeader(
                eyebrow = "MEMORY",
                title = "通勤记忆",
                subtitle = "AI 发现稳定偏好后先让你确认，再用于之后的规划。",
            )
        }

        if (pending.isNotEmpty()) {
            item { PremiumSectionHeader("待确认") }
            items(pending, key = { it.id }) { memory ->
                PremiumGlassCard {
                    Row(verticalAlignment = Alignment.Top) {
                        Surface(color = AppSoftBlue, shape = CircleShape) {
                            Icon(
                                Icons.Default.Psychology,
                                null,
                                tint = BrandBlue,
                                modifier = Modifier.padding(10.dp).size(20.dp),
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Text(memory.content, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        Button(
                            onClick = {
                                haptics.confirm()
                                onAccept(memory.id)
                            },
                            shape = RoundedCornerShape(16.dp),
                        ) {
                            Icon(Icons.Default.Check, null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(5.dp))
                            Text("记住")
                        }
                        OutlinedButton(
                            onClick = {
                                haptics.tick()
                                onReject(memory.id)
                            },
                            shape = RoundedCornerShape(16.dp),
                        ) {
                            Text("忽略")
                        }
                    }
                }
            }
        }

        item { PremiumSectionHeader("已接受") }
        if (accepted.isEmpty()) {
            item { PremiumEmptyCard("暂无已接受记忆", "之后确认的通勤偏好会保存在这里。") }
        } else {
            items(accepted, key = { it.id }) { memory ->
                PremiumGlassCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(memory.content, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        IconButton(onClick = {
                            haptics.reject()
                            onDelete(memory.id)
                        }) {
                            Icon(Icons.Default.DeleteOutline, "删除", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PremiumTripDetailScreen(
    detail: TripDetail,
    onBack: () -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    val haptics = rememberAppHaptics()
    val trip = detail.trip

    LazyColumn(
        modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding(),
        contentPadding = PaddingValues(20.dp, 8.dp, 20.dp, 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    modifier = Modifier.clickable {
                        haptics.tick()
                        onBack()
                    },
                    color = GlassWhite,
                    shape = CircleShape,
                ) {
                    Icon(Icons.Default.ArrowBack, "返回", modifier = Modifier.padding(10.dp).size(20.dp))
                }
                Spacer(Modifier.width(12.dp))
                Text("行程详情", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                Surface(
                    modifier = Modifier.clickable {
                        haptics.select()
                        ShareUtils.shareTrip(context, detail)
                    },
                    color = GlassWhite,
                    shape = CircleShape,
                ) {
                    Icon(Icons.Default.Share, "分享", tint = BrandBlue, modifier = Modifier.padding(10.dp).size(20.dp))
                }
            }
        }

        item {
            Column {
                Text(trip.title, style = MaterialTheme.typography.headlineMedium)
                Spacer(Modifier.height(5.dp))
                Text(trip.requestText, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
            }
        }

        item {
            Surface(
                modifier = Modifier.fillMaxWidth().shadow(12.dp, RoundedCornerShape(26.dp)),
                color = Color.White.copy(alpha = 0.96f),
                shape = RoundedCornerShape(26.dp),
                border = BorderStroke(1.dp, Color(0xFFDCE7FF)),
            ) {
                Column(Modifier.padding(20.dp)) {
                    Text("最晚出发", color = AppMuted, style = MaterialTheme.typography.labelLarge)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        formatTime(trip.departureEpochMillis),
                        color = BrandBlue,
                        style = MaterialTheme.typography.displaySmall,
                    )
                    Spacer(Modifier.height(16.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PremiumMetric("预计到达", formatTime(trip.arrivalEpochMillis), Modifier.weight(1.35f))
                        PremiumMetric("路线", "${trip.routeDurationMinutes} 分钟", Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(10.dp))
                    PremiumMetric("预留缓冲", "${trip.bufferMinutes} 分钟", Modifier.fillMaxWidth())
                }
            }
        }

        if (trip.weatherSummary.isNotBlank()) {
            item {
                PremiumGlassCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.WbSunny, null, tint = BrandBlue)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text("天气", fontWeight = FontWeight.Bold)
                            Text(trip.weatherSummary, color = AppMuted)
                        }
                    }
                }
            }
        }

        item { PremiumSectionHeader("路线分段") }
        items(detail.segments, key = { it.id }) { segment ->
            PremiumGlassCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(color = AppSoftBlue, shape = CircleShape) {
                        Icon(Icons.Default.Map, null, tint = BrandBlue, modifier = Modifier.padding(10.dp).size(20.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            "${modeLabelV11(segment.mode)} · ${segment.durationMinutes} 分钟",
                            color = BrandBlue,
                            fontWeight = FontWeight.Bold,
                        )
                        Text("${segment.fromName} → ${segment.toName}", fontWeight = FontWeight.SemiBold)
                        if (segment.instruction.isNotBlank()) {
                            Text(segment.instruction, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }

        if (trip.reasoning.isNotBlank()) {
            item {
                PremiumGlassCard {
                    Text("AI 规划说明", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    Text(trip.reasoning, color = AppMuted)
                }
            }
        }

        if (trip.status == "active") {
            item {
                OutlinedButton(
                    onClick = {
                        haptics.warning()
                        onCancel()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) {
                    Icon(Icons.Default.StopCircle, null)
                    Spacer(Modifier.width(8.dp))
                    Text("停止监控并取消行程")
                }
            }
        }
    }
}

@Composable
private fun PremiumSettingsEditor(
    settings: AppSettings,
    firstSetup: Boolean,
    onSave: (AppSettings) -> Unit,
) {
    val haptics = rememberAppHaptics()
    var draft by remember(settings) { mutableStateOf(settings) }
    var saved by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        PremiumPageHeader(
            eyebrow = if (firstSetup) "WELCOME · v1.1" else "SETTINGS · v1.1",
            title = if (firstSetup) "首次配置" else "设置",
            subtitle = if (firstSetup)
                "不需要账号和自建后端。敏感凭据保存在 Android 安全存储中。"
            else
                "AI、高德与 SMTP 均由手机直接连接。",
        )

        SettingsGroup("AI 接口") {
            PremiumField("Base URL", draft.openAiBaseUrl) { draft = draft.copy(openAiBaseUrl = it) }
            PremiumField("模型名称", draft.openAiModel) { draft = draft.copy(openAiModel = it) }
            PremiumField("API Key", draft.openAiKey, secret = true) { draft = draft.copy(openAiKey = it) }
        }

        SettingsGroup("高德与通勤") {
            PremiumField("高德 Web Service Key", draft.amapKey, secret = true) { draft = draft.copy(amapKey = it) }
            PremiumField("默认城市", draft.defaultCity) { draft = draft.copy(defaultCity = it) }
            PremiumField("默认出发点（可留空，优先 GPS）", draft.defaultOrigin) { draft = draft.copy(defaultOrigin = it) }
            PremiumField("通勤偏好", draft.commutePreferences, minLines = 2) { draft = draft.copy(commutePreferences = it) }
            OutlinedTextField(
                value = draft.routeChangeThresholdMinutes.toString(),
                onValueChange = {
                    val parsed = it.toIntOrNull()
                    if (parsed != null) draft = draft.copy(routeChangeThresholdMinutes = parsed.coerceIn(1, 60))
                },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("路线变化提醒阈值（分钟）") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
            )
        }

        SettingsGroup("邮件提醒 · 可选") {
            Text("Android 系统通知始终可用；配置 SMTP 后会同步发送重要邮件。", color = AppMuted, fontSize = 13.sp)
            PremiumField("提醒接收邮箱", draft.emailRecipient) { draft = draft.copy(emailRecipient = it) }
            PremiumField("SMTP Host", draft.smtpHost) { draft = draft.copy(smtpHost = it) }
            OutlinedTextField(
                value = draft.smtpPort.toString(),
                onValueChange = { draft = draft.copy(smtpPort = it.toIntOrNull() ?: draft.smtpPort) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("SMTP Port") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
            )
            PremiumField("SMTP 用户名", draft.smtpUser) { draft = draft.copy(smtpUser = it) }
            PremiumField("SMTP 密码 / 授权码", draft.smtpPassword, secret = true) { draft = draft.copy(smtpPassword = it) }
            PremiumField("发件人地址", draft.smtpFrom) { draft = draft.copy(smtpFrom = it) }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("SMTP SSL", fontWeight = FontWeight.SemiBold)
                    Text("通常用于 465 端口", color = AppMuted, fontSize = 12.sp)
                }
                Switch(
                    checked = draft.smtpSecure,
                    onCheckedChange = {
                        haptics.tick()
                        draft = draft.copy(smtpSecure = it)
                    },
                )
            }
        }

        Button(
            onClick = {
                haptics.confirm()
                onSave(draft)
                saved = true
            },
            enabled = draft.coreConfigured,
            modifier = Modifier.fillMaxWidth().height(54.dp),
            shape = RoundedCornerShape(18.dp),
        ) {
            Icon(Icons.Default.Check, null)
            Spacer(Modifier.width(8.dp))
            Text(if (firstSetup) "保存并进入 AI Commute 1.1" else "保存设置")
        }

        if (!draft.coreConfigured) {
            Text("至少需要 AI Base URL、模型、AI API Key 和高德 Key。", color = MaterialTheme.colorScheme.error)
        } else if (saved && !firstSetup) {
            Text("已保存到本机。", color = DeepGreen, fontWeight = FontWeight.SemiBold)
        }

        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun SettingsGroup(title: String, content: @Composable ColumnScope.() -> Unit) {
    PremiumGlassCard {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(4.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
private fun PremiumField(
    label: String,
    value: String,
    secret: Boolean = false,
    minLines: Int = 1,
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        singleLine = minLines == 1,
        minLines = minLines,
        visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        shape = RoundedCornerShape(16.dp),
    )
}

@Composable
private fun PremiumPageHeader(eyebrow: String, title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(
            eyebrow,
            color = BrandBlue,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
        )
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Text(subtitle, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PremiumGlassCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth().shadow(5.dp, RoundedCornerShape(23.dp)),
        color = GlassWhite,
        shape = RoundedCornerShape(23.dp),
        border = BorderStroke(1.dp, GlassBorder),
    ) {
        Column(
            modifier = Modifier.padding(17.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            content = content,
        )
    }
}

@Composable
private fun PremiumEmptyCard(title: String, subtitle: String) {
    PremiumGlassCard {
        Text(title, fontWeight = FontWeight.Bold)
        Text(subtitle, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
    }
}

private fun modeLabelV11(mode: String): String = when (mode.lowercase()) {
    "walking", "walk" -> "步行"
    "driving", "drive" -> "驾车"
    "transit", "bus" -> "公交地铁"
    "cycling", "bike", "bicycle" -> "骑行"
    else -> mode
}
