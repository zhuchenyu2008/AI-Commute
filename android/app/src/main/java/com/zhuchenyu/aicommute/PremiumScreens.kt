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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
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
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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

private val PremiumCard = Color.White.copy(alpha = 0.88f)
private val PremiumBorder = Color.White.copy(alpha = 0.96f)
private val PremiumGreen = Color(0xFF2F7D4A)
private val PremiumGreenSoft = Color(0xFFE9F6EE)
private val PremiumRedSoft = Color(0xFFFFEEEE)

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

        var tab by rememberSaveable { mutableStateOf(HomeTab.HOME) }
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
                modifier = Modifier
                    .fillMaxSize()
                    .padding(bottom = padding.calculateBottomPadding()),
            ) {
                when (tab) {
                    HomeTab.HOME -> PremiumHomeScreen(state, vm)
                    HomeTab.HISTORY -> PremiumHistoryScreen(state.trips, vm::openTrip)
                    HomeTab.MEMORIES -> PremiumMemoriesScreen(
                        memories = state.memories,
                        onAccept = vm::acceptMemory,
                        onReject = vm::rejectMemory,
                        onDelete = vm::deleteMemory,
                    )
                    HomeTab.SETTINGS -> PremiumSettingsEditor(
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
        modifier = Modifier
            .fillMaxSize()
            .background(AppBackground),
    ) {
        Canvas(Modifier.matchParentSize()) {
            val grid = Color(0xFFB8C4D8).copy(alpha = 0.16f)
            val blue = Color(0xFFBFD4FF).copy(alpha = 0.24f)
            val stepY = 72.dp.toPx()
            val stepX = 96.dp.toPx()

            var y = 24.dp.toPx()
            while (y < size.height * 0.78f) {
                drawLine(grid, Offset(0f, y), Offset(size.width, y + 22.dp.toPx()), 1.dp.toPx())
                y += stepY
            }

            var x = 28.dp.toPx()
            while (x < size.width) {
                drawLine(grid, Offset(x, 0f), Offset(x + 34.dp.toPx(), size.height * 0.7f), 1.dp.toPx())
                x += stepX
            }

            drawLine(
                blue,
                Offset(-40.dp.toPx(), size.height * 0.18f),
                Offset(size.width * 0.72f, size.height * 0.04f),
                9.dp.toPx(),
            )
            drawLine(
                blue.copy(alpha = 0.16f),
                Offset(size.width * 0.52f, size.height * 0.1f),
                Offset(size.width + 50.dp.toPx(), size.height * 0.34f),
                12.dp.toPx(),
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(230.dp)
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
private fun PremiumBottomBar(selected: HomeTab, onSelect: (HomeTab) -> Unit) {
    val items = listOf(
        Triple(HomeTab.HOME, "首页", Icons.Default.Home),
        Triple(HomeTab.HISTORY, "历史", Icons.Default.History),
        Triple(HomeTab.MEMORIES, "记忆", Icons.Default.Psychology),
        Triple(HomeTab.SETTINGS, "设置", Icons.Default.Settings),
    )
    val shape = RoundedCornerShape(30.dp)

    Surface(
        modifier = Modifier
            .navigationBarsPadding()
            .padding(horizontal = 18.dp, vertical = 8.dp)
            .fillMaxWidth()
            .shadow(14.dp, shape),
        color = Color.White.copy(alpha = 0.9f),
        shape = shape,
        border = BorderStroke(1.dp, PremiumBorder),
    ) {
        Row(
            modifier = Modifier.padding(7.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            items.forEach { (tab, label, icon) ->
                val active = selected == tab
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(23.dp))
                        .background(if (active) BrandBlue else Color.Transparent)
                        .clickable { onSelect(tab) }
                        .padding(vertical = 9.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = label,
                        tint = if (active) Color.White else AppMuted,
                        modifier = Modifier.size(20.dp),
                    )
                    if (active) {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            label,
                            color = Color.White,
                            style = MaterialTheme.typography.labelLarge,
                        )
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

    fun requestLocation() {
        haptics.tick()
        val fine = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        if (fine || coarse) {
            vm.refreshLocation()
        } else {
            locationLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
        }
    }

    val locationName = state.currentLocation?.label
        ?: state.settings.defaultOrigin.ifBlank { state.settings.defaultCity }
    val active = state.trips.firstOrNull { it.status == "active" }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = BrandBlue,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            if (state.isLocating) "正在定位" else "当前位置",
                            style = MaterialTheme.typography.labelMedium,
                            color = AppMuted,
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

                PremiumWeatherChip(
                    city = state.weather?.city ?: state.settings.defaultCity,
                    summary = state.weather?.summary ?: "天气暂未获取",
                    onRefresh = {
                        haptics.tick()
                        vm.refreshWeather()
                    },
                )
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "你要去哪，几点到？",
                    style = MaterialTheme.typography.headlineSmall,
                )
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
                    modifier = Modifier.fillMaxWidth(),
                    color = AppMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        state.error?.let { error ->
            item {
                PremiumErrorBanner(error = error, onClose = {
                    haptics.tick()
                    vm.clearError()
                })
            }
        }

        if (active != null) {
            item { PremiumSectionHeader("当前行程", "正在持续监控路线变化") }
            item {
                PremiumActiveTripCard(active) {
                    haptics.select()
                    vm.openTrip(active.id)
                }
            }
        }

        if (state.trips.isNotEmpty()) {
            item { PremiumSectionHeader("最近行程", "继续查看最近的通勤记录") }
            items(state.trips.take(3), key = { it.id }) { trip ->
                PremiumTripCard(trip) {
                    haptics.select()
                    vm.openTrip(trip.id)
                }
            }
        } else if (active == null) {
            item {
                PremiumEmptyCard(
                    icon = Icons.Default.Schedule,
                    title = "还没有行程",
                    text = "从上面的输入框开始，第一条通勤方案会出现在这里。",
                )
            }
        }
    }
}

@Composable
private fun PremiumWeatherChip(city: String, summary: String, onRefresh: () -> Unit) {
    Surface(
        modifier = Modifier
            .width(138.dp)
            .shadow(7.dp, RoundedCornerShape(22.dp))
            .clip(RoundedCornerShape(22.dp))
            .clickable(onClick = onRefresh),
        color = PremiumCard,
        border = BorderStroke(1.dp, PremiumBorder),
        shape = RoundedCornerShape(22.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                color = AppSoftBlue,
                shape = CircleShape,
            ) {
                Icon(
                    Icons.Default.WbSunny,
                    contentDescription = null,
                    tint = BrandBlue,
                    modifier = Modifier.padding(7.dp).size(18.dp),
                )
            }
            Spacer(Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    city,
                    style = MaterialTheme.typography.labelLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    summary,
                    color = AppMuted,
                    fontSize = 11.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
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
    val shape = RoundedCornerShape(30.dp)
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(7.dp, shape),
        color = Color(0xFFF1F4F7).copy(alpha = 0.96f),
        shape = shape,
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.9f)),
    ) {
        Row(
            modifier = Modifier.padding(start = 17.dp, top = 8.dp, bottom = 8.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = null,
                tint = AppMuted,
                modifier = Modifier.size(21.dp),
            )
            Spacer(Modifier.width(10.dp))
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp),
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = AppInk),
                cursorBrush = SolidColor(BrandBlue),
                maxLines = 3,
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (value.isBlank()) {
                            Text(
                                "例如：明天下午五点前到学校，公交优先",
                                color = Color(0xFF7B7F8B),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                        inner()
                    }
                },
            )
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = onPlan,
                enabled = value.isNotBlank() && !isPlanning,
                modifier = Modifier.height(48.dp),
                shape = RoundedCornerShape(24.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                contentPadding = PaddingValues(horizontal = 16.dp),
            ) {
                if (isPlanning) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = Color.White,
                    )
                } else {
                    Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("规划")
                }
            }
        }
    }
}

@Composable
private fun PremiumActiveTripCard(trip: TripEntity, onClick: () -> Unit) {
    val shape = RoundedCornerShape(28.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(14.dp, shape)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    colors = listOf(Color(0xFF1749BD), BrandBlue, Color(0xFF547BE6)),
                ),
            )
            .clickable(onClick = onClick)
            .padding(20.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    color = Color.White.copy(alpha = 0.17f),
                    shape = RoundedCornerShape(50),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.2f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF9CF0BC)),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text("监控中", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(Modifier.weight(1f))
                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color.White.copy(alpha = 0.82f))
            }

            Column {
                Text(
                    trip.title,
                    color = Color.White,
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    trip.destination,
                    color = Color.White.copy(alpha = 0.74f),
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PremiumBlueMetric(
                    label = "最晚出发",
                    value = formatTime(trip.departureEpochMillis),
                    modifier = Modifier.weight(1.25f),
                )
                PremiumBlueMetric(
                    label = "预计耗时",
                    value = "${trip.routeDurationMinutes} 分",
                    modifier = Modifier.weight(1f),
                )
                PremiumBlueMetric(
                    label = "缓冲",
                    value = "${trip.bufferMinutes} 分",
                    modifier = Modifier.weight(0.85f),
                )
            }
        }
    }
}

@Composable
private fun PremiumBlueMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(Color.White.copy(alpha = 0.12f))
            .padding(horizontal = 11.dp, vertical = 10.dp),
    ) {
        Text(label, color = Color.White.copy(alpha = 0.68f), fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(2.dp))
        Text(value, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun PremiumHistoryScreen(trips: List<TripEntity>, onOpen: (String) -> Unit) {
    val haptics = rememberAppHaptics()
    LazyColumn(
        modifier = Modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        item {
            PremiumPageHeader(
                eyebrow = "LOCAL HISTORY",
                title = "历史行程",
                subtitle = "全部记录只保存在这台手机。当前共 ${trips.size} 条。",
            )
        }
        if (trips.isEmpty()) {
            item {
                PremiumEmptyCard(Icons.Default.History, "还没有历史记录", "完成或取消的行程会在这里按时间保留。")
            }
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
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            PremiumPageHeader(
                eyebrow = "COMMUTE MEMORY",
                title = "通勤记忆",
                subtitle = "AI 先提出候选偏好，只有你确认后才会参与之后的规划。",
            )
        }

        if (pending.isNotEmpty()) {
            item { PremiumSectionHeader("待确认", "${pending.size} 条候选记忆") }
            items(pending, key = { it.id }) { memory ->
                PremiumGlassCard(borderColor = BrandBlue.copy(alpha = 0.16f)) {
                    Row(verticalAlignment = Alignment.Top) {
                        PremiumIconBubble(Icons.Default.Psychology, AppSoftBlue, BrandBlue)
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(memory.content, style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = {
                                        haptics.confirm()
                                        onAccept(memory.id)
                                    },
                                    shape = RoundedCornerShape(18.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                                ) {
                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(17.dp))
                                    Spacer(Modifier.width(5.dp))
                                    Text("记住")
                                }
                                OutlinedButton(
                                    onClick = {
                                        haptics.reject()
                                        onReject(memory.id)
                                    },
                                    shape = RoundedCornerShape(18.dp),
                                ) {
                                    Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(17.dp))
                                    Spacer(Modifier.width(5.dp))
                                    Text("忽略")
                                }
                            }
                        }
                    }
                }
            }
        }

        item { PremiumSectionHeader("已接受", "会用于未来的 AI 规划") }
        if (accepted.isEmpty()) {
            item {
                PremiumEmptyCard(Icons.Default.Psychology, "还没有已接受的记忆", "确认过的稳定通勤偏好会出现在这里。")
            }
        } else {
            items(accepted, key = { it.id }) { memory ->
                PremiumGlassCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PremiumIconBubble(Icons.Default.Check, PremiumGreenSoft, PremiumGreen)
                        Spacer(Modifier.width(12.dp))
                        Text(memory.content, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        IconButton(
                            onClick = {
                                haptics.warning()
                                onDelete(memory.id)
                            },
                        ) {
                            Icon(Icons.Default.DeleteOutline, contentDescription = "删除", tint = AppMuted)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PremiumTripCard(trip: TripEntity, onClick: () -> Unit) {
    PremiumGlassCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PremiumIconBubble(Icons.Default.Schedule, AppSoftBlue, BrandBlue)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        trip.title,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.width(8.dp))
                    PremiumStatusPill(trip.status)
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "${formatTime(trip.departureEpochMillis)} 出发 · ${trip.routeDurationMinutes} 分钟",
                    color = AppMuted,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    trip.destination,
                    color = AppMuted,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(4.dp))
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color(0xFFA0A5AF))
        }
    }
}

@Composable
private fun PremiumStatusPill(status: String) {
    val text = when (status) {
        "active" -> "监控中"
        "completed" -> "已完成"
        "cancelled" -> "已取消"
        else -> status
    }
    val colors = when (status) {
        "active" -> AppSoftBlue to BrandBlue
        "completed" -> PremiumGreenSoft to PremiumGreen
        else -> AppSoftSlate to AppMuted
    }
    Surface(color = colors.first, shape = RoundedCornerShape(50)) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
            color = colors.second,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
        )
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
        modifier = Modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 10.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(15.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PremiumRoundAction(Icons.Default.ArrowBack, "返回") {
                    haptics.tick()
                    onBack()
                }
                Spacer(Modifier.width(12.dp))
                Text("行程详情", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.weight(1f))
                PremiumRoundAction(Icons.Default.Share, "分享") {
                    haptics.select()
                    ShareUtils.shareTrip(context, detail)
                }
            }
        }

        item {
            Column {
                Text(
                    trip.title,
                    style = MaterialTheme.typography.headlineMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(5.dp))
                Text(trip.requestText, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
            }
        }

        item { PremiumDepartureHero(trip) }

        if (trip.weatherSummary.isNotBlank()) {
            item {
                PremiumGlassCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PremiumIconBubble(Icons.Default.WbSunny, AppSoftBlue, BrandBlue)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("沿途天气", style = MaterialTheme.typography.titleMedium)
                            Text(trip.weatherSummary, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }

        item { PremiumSectionHeader("路线分段", "${detail.segments.size} 个步骤") }
        items(detail.segments, key = { it.id }) { segment ->
            PremiumGlassCard {
                Row(verticalAlignment = Alignment.Top) {
                    Surface(color = AppSoftBlue, shape = CircleShape) {
                        Text(
                            (segment.sequence + 1).toString(),
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                            color = BrandBlue,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                modeLabel(segment.mode),
                                color = BrandBlue,
                                style = MaterialTheme.typography.labelLarge,
                            )
                            Spacer(Modifier.width(7.dp))
                            Text("${segment.durationMinutes} 分钟", color = AppMuted, fontSize = 12.sp)
                        }
                        Spacer(Modifier.height(4.dp))
                        Text("${segment.fromName} → ${segment.toName}", style = MaterialTheme.typography.titleMedium)
                        if (segment.instruction.isNotBlank()) {
                            Spacer(Modifier.height(5.dp))
                            Text(segment.instruction, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
                        }
                        if (segment.distanceMeters > 0) {
                            Spacer(Modifier.height(5.dp))
                            Text("${segment.distanceMeters} 米", color = AppMuted, fontSize = 11.sp)
                        }
                    }
                }
            }
        }

        if (trip.reasoning.isNotBlank()) {
            item {
                PremiumGlassCard {
                    Row(verticalAlignment = Alignment.Top) {
                        PremiumIconBubble(Icons.Default.Psychology, AppSoftBlue, BrandBlue)
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("AI 规划说明", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(5.dp))
                            Text(trip.reasoning, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
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
                    shape = RoundedCornerShape(22.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.28f)),
                ) {
                    Icon(Icons.Default.StopCircle, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("停止监控并取消行程")
                }
            }
        }
    }
}

@Composable
private fun PremiumDepartureHero(trip: TripEntity) {
    val shape = RoundedCornerShape(28.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(12.dp, shape)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(Color(0xFFF8FBFF), Color(0xFFEAF1FF), Color.White),
                ),
            )
            .padding(20.dp),
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("建议最晚出发", color = AppMuted, style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.weight(1f))
                PremiumStatusPill(trip.status)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                formatTime(trip.departureEpochMillis),
                color = BrandBlue,
                style = MaterialTheme.typography.displaySmall,
            )
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PremiumLightMetric("预计到达", formatTime(trip.arrivalEpochMillis), Modifier.weight(1f))
                PremiumLightMetric("路线", "${trip.routeDurationMinutes} 分", Modifier.weight(1f))
                PremiumLightMetric("缓冲", "${trip.bufferMinutes} 分", Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun PremiumLightMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White.copy(alpha = 0.82f))
            .padding(10.dp),
    ) {
        Text(label, color = AppMuted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(3.dp))
        Text(value, color = AppInk, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun PremiumSettingsEditor(
    settings: AppSettings,
    firstSetup: Boolean,
    onSave: (AppSettings) -> Unit,
) {
    var draft by remember(settings) { mutableStateOf(settings) }
    var saved by remember { mutableStateOf(false) }
    val haptics = rememberAppHaptics()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 18.dp)
            .windowInsetsPadding(WindowInsets.navigationBars),
        verticalArrangement = Arrangement.spacedBy(15.dp),
    ) {
        PremiumPageHeader(
            eyebrow = if (firstSetup) "PRIVATE SETUP" else "APP SETTINGS",
            title = if (firstSetup) "首次配置" else "设置",
            subtitle = if (firstSetup) {
                "没有账号、没有自建后端。敏感凭据只保存在本机，并由 Android Keystore 加密。"
            } else {
                "AI、高德与 SMTP 都从手机直接连接；修改后立即用于后续规划和提醒。"
            },
        )

        PremiumSettingsSection(
            icon = Icons.Default.Lock,
            title = "AI 接口",
            subtitle = "OpenAI-compatible Chat Completions",
        ) {
            PremiumField(
                value = draft.openAiBaseUrl,
                onValueChange = { draft = draft.copy(openAiBaseUrl = it) },
                label = "Base URL",
            )
            PremiumField(
                value = draft.openAiModel,
                onValueChange = { draft = draft.copy(openAiModel = it) },
                label = "模型名称",
            )
            PremiumField(
                value = draft.openAiKey,
                onValueChange = { draft = draft.copy(openAiKey = it) },
                label = "API Key",
                password = true,
            )
        }

        PremiumSettingsSection(
            icon = Icons.Default.Map,
            title = "高德地图",
            subtitle = "地点、天气、路线与 GPS 定位",
        ) {
            PremiumField(
                value = draft.amapKey,
                onValueChange = { draft = draft.copy(amapKey = it) },
                label = "高德 Web Service Key",
                password = true,
            )
            PremiumField(
                value = draft.defaultCity,
                onValueChange = { draft = draft.copy(defaultCity = it) },
                label = "默认城市",
            )
            PremiumField(
                value = draft.defaultOrigin,
                onValueChange = { draft = draft.copy(defaultOrigin = it) },
                label = "默认出发点（可留空，优先 GPS）",
            )
            PremiumField(
                value = draft.commutePreferences,
                onValueChange = { draft = draft.copy(commutePreferences = it) },
                label = "通勤偏好",
                minLines = 2,
            )
            PremiumField(
                value = draft.routeChangeThresholdMinutes.toString(),
                onValueChange = {
                    draft = draft.copy(
                        routeChangeThresholdMinutes = it.toIntOrNull()?.coerceIn(1, 60)
                            ?: draft.routeChangeThresholdMinutes,
                    )
                },
                label = "路线变化提醒阈值（分钟）",
                keyboardType = KeyboardType.Number,
            )
        }

        PremiumSettingsSection(
            icon = Icons.Default.Notifications,
            title = "提醒与邮件",
            subtitle = "系统通知默认开启；SMTP 为可选增强",
        ) {
            Surface(color = AppSoftBlue, shape = RoundedCornerShape(16.dp)) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Default.Notifications, contentDescription = null, tint = BrandBlue)
                    Spacer(Modifier.width(9.dp))
                    Text(
                        "关键提醒会使用适度振动；路线重大变化采用短促双段触感。",
                        color = Color(0xFF27406B),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            PremiumField(
                value = draft.emailRecipient,
                onValueChange = { draft = draft.copy(emailRecipient = it) },
                label = "提醒接收邮箱",
            )
            PremiumField(
                value = draft.smtpHost,
                onValueChange = { draft = draft.copy(smtpHost = it) },
                label = "SMTP Host",
            )
            PremiumField(
                value = draft.smtpPort.toString(),
                onValueChange = { draft = draft.copy(smtpPort = it.toIntOrNull() ?: draft.smtpPort) },
                label = "SMTP Port",
                keyboardType = KeyboardType.Number,
            )
            PremiumField(
                value = draft.smtpUser,
                onValueChange = { draft = draft.copy(smtpUser = it) },
                label = "SMTP 用户名",
            )
            PremiumField(
                value = draft.smtpPassword,
                onValueChange = { draft = draft.copy(smtpPassword = it) },
                label = "SMTP 密码 / 授权码",
                password = true,
            )
            PremiumField(
                value = draft.smtpFrom,
                onValueChange = { draft = draft.copy(smtpFrom = it) },
                label = "发件人地址",
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("SMTP SSL", style = MaterialTheme.typography.titleMedium)
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
            shape = RoundedCornerShape(22.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
        ) {
            Icon(Icons.Default.Check, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text(if (firstSetup) "保存并进入 AI Commute" else "保存设置")
        }

        if (!draft.coreConfigured) {
            Text(
                "至少需要填写 AI Base URL、模型、AI API Key 和高德 Key。",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
        } else if (saved && !firstSetup) {
            Text(
                "已安全保存到本机。",
                color = PremiumGreen,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }

        Spacer(Modifier.height(if (firstSetup) 12.dp else 78.dp))
    }
}

@Composable
private fun PremiumSettingsSection(
    icon: ImageVector,
    title: String,
    subtitle: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    PremiumGlassCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PremiumIconBubble(icon, AppSoftBlue, BrandBlue)
            Spacer(Modifier.width(11.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleLarge)
                Text(subtitle, color = AppMuted, fontSize = 12.sp)
            }
        }
        Spacer(Modifier.height(8.dp))
        content()
    }
}

@Composable
private fun PremiumField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    password: Boolean = false,
    minLines: Int = 1,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        shape = RoundedCornerShape(17.dp),
        minLines = minLines,
        singleLine = minLines == 1,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
    )
}

@Composable
private fun PremiumDepartureTitle(title: String, subtitle: String) {
    Column {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(5.dp))
        Text(subtitle, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PremiumPageHeader(eyebrow: String, title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            eyebrow,
            color = BrandBlue,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.8.sp,
        )
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Text(subtitle, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PremiumSectionHeader(title: String, subtitle: String) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(subtitle, color = AppMuted, fontSize = 12.sp)
        }
    }
}

@Composable
private fun PremiumErrorBanner(error: String, onClose: () -> Unit) {
    Surface(
        color = PremiumRedSoft,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.12f)),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                error,
                modifier = Modifier.weight(1f),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
            IconButton(onClick = onClose) {
                Icon(Icons.Default.Close, contentDescription = "关闭", tint = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun PremiumGlassCard(
    modifier: Modifier = Modifier,
    borderColor: Color = PremiumBorder,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(24.dp)
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .shadow(8.dp, shape),
        color = PremiumCard,
        shape = shape,
        border = BorderStroke(1.dp, borderColor),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
            content = content,
        )
    }
}

@Composable
private fun PremiumIconBubble(icon: ImageVector, background: Color, tint: Color) {
    Surface(color = background, shape = CircleShape) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.padding(9.dp).size(19.dp),
        )
    }
}

@Composable
private fun PremiumRoundAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .size(44.dp)
            .shadow(5.dp, CircleShape)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        color = PremiumCard,
        shape = CircleShape,
        border = BorderStroke(1.dp, PremiumBorder),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = label, tint = AppInk, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun PremiumEmptyCard(icon: ImageVector, title: String, text: String) {
    PremiumGlassCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PremiumIconBubble(icon, AppSoftSlate, AppMuted)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(text, color = AppMuted, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
