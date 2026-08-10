package com.zhuchenyu.aicommute

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun AICommuteApp(vm: AppViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()

    if (!state.settings.coreConfigured) {
        SettingsEditor(
            settings = state.settings,
            firstSetup = true,
            onSave = vm::saveSettings
        )
        return
    }

    state.selectedTrip?.let { detail ->
        TripDetailScreen(
            detail = detail,
            onBack = vm::closeTrip,
            onCancel = { vm.cancelTrip(detail.trip.id) }
        )
        return
    }

    var tab by rememberSaveable { mutableStateOf(HomeTab.HOME) }
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == HomeTab.HOME,
                    onClick = { tab = HomeTab.HOME },
                    icon = { Icon(Icons.Default.Home, null) },
                    label = { Text("首页") }
                )
                NavigationBarItem(
                    selected = tab == HomeTab.HISTORY,
                    onClick = { tab = HomeTab.HISTORY },
                    icon = { Icon(Icons.Default.History, null) },
                    label = { Text("历史") }
                )
                NavigationBarItem(
                    selected = tab == HomeTab.MEMORIES,
                    onClick = { tab = HomeTab.MEMORIES },
                    icon = { Icon(Icons.Default.Psychology, null) },
                    label = { Text("记忆") }
                )
                NavigationBarItem(
                    selected = tab == HomeTab.SETTINGS,
                    onClick = { tab = HomeTab.SETTINGS },
                    icon = { Icon(Icons.Default.Settings, null) },
                    label = { Text("设置") }
                )
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when (tab) {
                HomeTab.HOME -> HomeScreen(state, vm)
                HomeTab.HISTORY -> HistoryScreen(state.trips, vm::openTrip)
                HomeTab.MEMORIES -> MemoriesScreen(
                    state.memories,
                    vm::acceptMemory,
                    vm::rejectMemory,
                    vm::deleteMemory
                )
                HomeTab.SETTINGS -> SettingsEditor(
                    settings = state.settings,
                    firstSetup = false,
                    onSave = vm::saveSettings
                )
            }
        }
    }
}

@Composable
private fun HomeScreen(state: AppUiState, vm: AppViewModel) {
    val context = LocalContext.current
    var request by rememberSaveable { mutableStateOf("") }

    val locationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        if (result.values.any { it }) vm.refreshLocation()
    }
    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {}

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    fun requestLocation() {
        val fine = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (fine || coarse) {
            vm.refreshLocation()
        } else {
            locationLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "当前位置",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        state.currentLocation?.label
                            ?: state.settings.defaultOrigin.ifBlank { state.settings.defaultCity },
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
                FilledTonalButton(onClick = ::requestLocation) {
                    if (state.isLocating) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.LocationOn, null)
                    }
                    Spacer(Modifier.size(6.dp))
                    Text(if (state.isLocating) "定位中" else "定位")
                }
            }
        }

        item {
            GlassCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.WbSunny,
                        null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.size(10.dp))
                    Column {
                        Text(
                            state.weather?.city ?: state.settings.defaultCity,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            state.weather?.summary ?: "天气暂未获取",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = vm::refreshWeather) {
                        Icon(Icons.Default.Refresh, "刷新天气")
                    }
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "你准备去哪？",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "直接说目的地、希望到达的时间和偏好，AI 会结合天气、路线与记忆倒推出发时间。",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = request,
                    onValueChange = { request = it },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 4,
                    placeholder = { Text("例如：明天下午五点前到外事学校，公交优先，别走太远") }
                )
                Button(
                    onClick = { vm.plan(request) },
                    enabled = request.isNotBlank() && !state.isPlanning,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (state.isPlanning) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(Icons.Default.Send, null)
                    }
                    Spacer(Modifier.size(8.dp))
                    Text(if (state.isPlanning) "正在规划…" else "生成通勤方案")
                }
            }
        }

        state.error?.let { error ->
            item {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            error,
                            modifier = Modifier.weight(1f),
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        IconButton(onClick = vm::clearError) {
                            Icon(Icons.Default.Close, "关闭")
                        }
                    }
                }
            }
        }

        val active = state.trips.firstOrNull { it.status == "active" }
        if (active != null) {
            item {
                Text("当前行程", fontWeight = FontWeight.Bold)
            }
            item {
                TripCard(active) { vm.openTrip(active.id) }
            }
        }

        if (state.trips.isNotEmpty()) {
            item {
                Text("最近行程", fontWeight = FontWeight.Bold)
            }
            items(state.trips.take(3), key = { it.id }) { trip ->
                TripCard(trip) { vm.openTrip(trip.id) }
            }
        }
    }
}

@Composable
private fun HistoryScreen(trips: List<TripEntity>, onOpen: (String) -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("历史行程", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                "数据只保存在这台手机的本地数据库中。",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (trips.isEmpty()) {
            item { EmptyCard("还没有行程记录") }
        } else {
            items(trips, key = { it.id }) { trip ->
                TripCard(trip) { onOpen(trip.id) }
            }
        }
    }
}

@Composable
private fun MemoriesScreen(
    memories: List<MemoryEntity>,
    onAccept: (String) -> Unit,
    onReject: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    val pending = memories.filter { it.status == "pending" }
    val accepted = memories.filter { it.status == "accepted" }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("通勤记忆", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                "AI 发现的稳定偏好会先作为候选，你确认后才用于之后的规划。",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (pending.isNotEmpty()) {
            item { Text("待确认", fontWeight = FontWeight.Bold) }
            items(pending, key = { it.id }) { memory ->
                GlassCard {
                    Text(memory.content, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { onAccept(memory.id) }) {
                            Icon(Icons.Default.Check, null)
                            Spacer(Modifier.size(4.dp))
                            Text("记住")
                        }
                        OutlinedButton(onClick = { onReject(memory.id) }) {
                            Icon(Icons.Default.Close, null)
                            Spacer(Modifier.size(4.dp))
                            Text("忽略")
                        }
                    }
                }
            }
        }
        item { Text("已接受", fontWeight = FontWeight.Bold) }
        if (accepted.isEmpty()) {
            item { EmptyCard("暂无已接受的通勤记忆") }
        } else {
            items(accepted, key = { it.id }) { memory ->
                GlassCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(memory.content, modifier = Modifier.weight(1f))
                        IconButton(onClick = { onDelete(memory.id) }) {
                            Icon(Icons.Default.Close, "删除")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TripCard(trip: TripEntity, onClick: () -> Unit) {
    GlassCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(trip.title, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Spacer(Modifier.height(4.dp))
                Text(
                    "${formatTime(trip.departureEpochMillis)} 出发 · ${trip.routeDurationMinutes} 分钟",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    trip.destination,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            StatusPill(trip.status)
        }
    }
}

@Composable
private fun StatusPill(status: String) {
    val text = when (status) {
        "active" -> "监控中"
        "completed" -> "已完成"
        "cancelled" -> "已取消"
        else -> status
    }
    Card(
        shape = RoundedCornerShape(50),
        colors = CardDefaults.cardColors(
            containerColor = if (status == "active")
                MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            fontSize = 12.sp
        )
    }
}

@Composable
private fun TripDetailScreen(
    detail: TripDetail,
    onBack: () -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    val trip = detail.trip

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.navigationBars),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, "返回")
                }
                Text(
                    "行程详情",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { ShareUtils.shareTrip(context, detail) }) {
                    Icon(Icons.Default.Share, "分享")
                }
            }
        }

        item {
            Text(trip.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(trip.requestText, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        item {
            GlassCard {
                Text("最晚出发", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    formatTime(trip.departureEpochMillis),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                    Column {
                        Text("预计到达", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(formatTime(trip.arrivalEpochMillis), fontWeight = FontWeight.SemiBold)
                    }
                    Column {
                        Text("路线", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("${trip.routeDurationMinutes} 分钟", fontWeight = FontWeight.SemiBold)
                    }
                    Column {
                        Text("缓冲", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("${trip.bufferMinutes} 分钟", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }

        if (trip.weatherSummary.isNotBlank()) {
            item {
                GlassCard {
                    Text("天气", fontWeight = FontWeight.Bold)
                    Text(trip.weatherSummary)
                }
            }
        }

        item { Text("路线分段", fontWeight = FontWeight.Bold, fontSize = 18.sp) }
        items(detail.segments, key = { it.id }) { segment ->
            GlassCard {
                Text(
                    "${modeLabel(segment.mode)} · ${segment.durationMinutes} 分钟",
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold
                )
                Text("${segment.fromName} → ${segment.toName}", fontWeight = FontWeight.SemiBold)
                if (segment.instruction.isNotBlank()) {
                    Text(segment.instruction, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (segment.distanceMeters > 0) {
                    Text(
                        "${segment.distanceMeters} 米",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        if (trip.reasoning.isNotBlank()) {
            item {
                GlassCard {
                    Text("AI 规划说明", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text(trip.reasoning, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        if (trip.status == "active") {
            item {
                OutlinedButton(
                    onClick = onCancel,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.StopCircle, null)
                    Spacer(Modifier.size(8.dp))
                    Text("停止监控并取消行程")
                }
            }
        }
    }
}

@Composable
private fun SettingsEditor(
    settings: AppSettings,
    firstSetup: Boolean,
    onSave: (AppSettings) -> Unit,
) {
    var draft by remember(settings) { mutableStateOf(settings) }
    var saved by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
            .windowInsetsPadding(WindowInsets.navigationBars),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            if (firstSetup) "首次配置" else "设置",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )
        Text(
            if (firstSetup)
                "无需账号和后端。下面的密钥只保存在本机，其中敏感项由 Android Keystore 加密。"
            else
                "AI、高德与 SMTP 都由手机直接连接；没有任何 AI-Commute 自建后端。",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        SectionTitle("AI 接口")
        OutlinedTextField(
            value = draft.openAiBaseUrl,
            onValueChange = { draft = draft.copy(openAiBaseUrl = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("OpenAI-compatible Base URL") },
            singleLine = true
        )
        OutlinedTextField(
            value = draft.openAiModel,
            onValueChange = { draft = draft.copy(openAiModel = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("模型名称") },
            singleLine = true
        )
        OutlinedTextField(
            value = draft.openAiKey,
            onValueChange = { draft = draft.copy(openAiKey = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("API Key") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation()
        )

        SectionTitle("高德地图")
        OutlinedTextField(
            value = draft.amapKey,
            onValueChange = { draft = draft.copy(amapKey = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("高德 Web Service Key") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation()
        )
        OutlinedTextField(
            value = draft.defaultCity,
            onValueChange = { draft = draft.copy(defaultCity = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("默认城市") },
            singleLine = true
        )
        OutlinedTextField(
            value = draft.defaultOrigin,
            onValueChange = { draft = draft.copy(defaultOrigin = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("默认出发点（可留空，优先用 GPS）") }
        )
        OutlinedTextField(
            value = draft.commutePreferences,
            onValueChange = { draft = draft.copy(commutePreferences = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("通勤偏好") },
            minLines = 2
        )
        OutlinedTextField(
            value = draft.routeChangeThresholdMinutes.toString(),
            onValueChange = {
                draft = draft.copy(
                    routeChangeThresholdMinutes = it.toIntOrNull()?.coerceIn(1, 60)
                        ?: draft.routeChangeThresholdMinutes
                )
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("路线变化提醒阈值（分钟）") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true
        )

        SectionTitle("邮件提醒（可选，但推荐配置）")
        Text(
            "Android 系统通知始终可用；配置 SMTP 后，同一重要提醒还会发送邮件。",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp
        )
        OutlinedTextField(
            value = draft.emailRecipient,
            onValueChange = { draft = draft.copy(emailRecipient = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("提醒接收邮箱") },
            singleLine = true
        )
        OutlinedTextField(
            value = draft.smtpHost,
            onValueChange = { draft = draft.copy(smtpHost = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("SMTP Host") },
            singleLine = true
        )
        OutlinedTextField(
            value = draft.smtpPort.toString(),
            onValueChange = {
                draft = draft.copy(smtpPort = it.toIntOrNull() ?: draft.smtpPort)
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("SMTP Port") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true
        )
        OutlinedTextField(
            value = draft.smtpUser,
            onValueChange = { draft = draft.copy(smtpUser = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("SMTP 用户名") },
            singleLine = true
        )
        OutlinedTextField(
            value = draft.smtpPassword,
            onValueChange = { draft = draft.copy(smtpPassword = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("SMTP 密码 / 授权码") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation()
        )
        OutlinedTextField(
            value = draft.smtpFrom,
            onValueChange = { draft = draft.copy(smtpFrom = it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("发件人地址") },
            singleLine = true
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("SMTP SSL（通常 465 端口）", modifier = Modifier.weight(1f))
            Switch(
                checked = draft.smtpSecure,
                onCheckedChange = { draft = draft.copy(smtpSecure = it) }
            )
        }

        Button(
            onClick = {
                onSave(draft)
                saved = true
            },
            enabled = draft.coreConfigured,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Default.Check, null)
            Spacer(Modifier.size(8.dp))
            Text(if (firstSetup) "保存并进入 AI Commute" else "保存设置")
        }
        if (!draft.coreConfigured) {
            Text(
                "至少需要填写 AI Base URL、模型、AI API Key 和高德 Key。",
                color = MaterialTheme.colorScheme.error
            )
        } else if (saved && !firstSetup) {
            Text("已保存到本机。", color = MaterialTheme.colorScheme.primary)
        }
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun SectionTitle(text: String) {
    Spacer(Modifier.height(4.dp))
    Text(text, fontWeight = FontWeight.Bold, fontSize = 18.sp)
    HorizontalDivider()
}

@Composable
private fun GlassCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            content = content
        )
    }
}

@Composable
private fun EmptyCard(text: String) {
    GlassCard {
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
