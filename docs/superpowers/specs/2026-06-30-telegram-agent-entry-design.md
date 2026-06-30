# Telegram 双向 Agent 入口设计

## 目标

把 Telegram 从单向通知渠道升级为网站同级入口。用户在 Telegram 中发送 `/new 明天九点到外事学校`，或先发送 `/new` 再发送规划文本时，系统应像网站首页一样创建 Agent 会话和行程；之后用户继续发送普通文本，应像网站行程详情里的智能体对话一样续聊、调整路线、更新提醒或创建记忆候选。

Telegram 入口必须复用现有网站规划和续聊能力，不单独实现一套路线规划、行程创建或提醒逻辑。提醒通知仍由现有调度器处理；发送 `/new` 只切换 Telegram 当前对话上下文，不停止旧行程提醒，只有用户显式取消监控时才停止旧提醒。

## 当前项目基础

现有项目已经具备：

- 网站新建规划入口：`startPlanningSession` + `runPlanningSession`。
- 网站续聊入口：`acceptAgentSessionMessage` + `runAcceptedContinuationSession`。
- 用户设置中的 `telegramChatId`，可作为 Telegram chat 到应用用户的绑定键。
- Telegram 出站通知适配器 `sendTelegram`。
- 调度器根据 `ReminderJob` 发送 Telegram/email 并写入 `NotificationLog`。

因此最佳实现是增加“Telegram 传输层 + 会话映射层”，而不是复制 Agent 规划逻辑。

## 推荐方案

使用 Telegram 长轮询 worker，而不是 webhook。

理由：

- 当前项目是本地优先和 Docker 化部署，不要求公网 HTTPS。
- Docker Compose 已有 `web` 和 `scheduler` 常驻进程，增加 `telegram` worker 与现有架构一致。
- worker、web、scheduler 通过同一个 SQLite 数据库协作，便于复用现有 AgentSession、Trip、ReminderJob 和 NotificationLog。

新增脚本和服务：

- `npm run telegram:poll`：启动 Telegram 长轮询进程。
- Docker Compose 新增 `telegram` 服务，读取同一份 `.env`，挂载同一份 SQLite 数据。
- 未配置 `TELEGRAM_BOT_TOKEN` 时，worker 输出中文提示并安静等待或退出，不影响 web 和 scheduler。

Telegram Bot API 能力依据：

- `getUpdates` 支持通过 `allowed_updates` 接收 `message` 和 `callback_query`。
- `sendMessage` 的 `reply_markup` 可携带 `InlineKeyboardMarkup`。
- `InlineKeyboardMarkup` 由按钮行组成，每个 `InlineKeyboardButton` 可携带 `callback_data`。
- `callback_data` 长度限制为 1-64 bytes，因此使用短动作前缀加 `tripId`，例如 `sw:<tripId>`。
- 用户点击内联按钮后，bot 收到 `CallbackQuery`；worker 必须调用 `answerCallbackQuery`，否则 Telegram 客户端会持续显示加载状态。

## 数据模型

新增 `TelegramChatState`：

- `chatId`：Telegram chat id，唯一。
- `userId`：绑定的应用用户。
- `activeAgentSessionId`：当前 Telegram 对话绑定的 AgentSession，可为空。
- `activeTripId`：当前 Telegram 对话绑定的 Trip，可为空。
- `mode`：`idle`、`awaiting_new_prompt`、`active`。
- `createdAt`、`updatedAt`。

新增 `TelegramBotState`：

- `id`：固定值，例如 `default`。
- `lastUpdateId`：最后处理过的 Telegram update id。
- `updatedAt`。

`TelegramBotState` 用于避免 worker 重启后重复处理旧消息。`TelegramChatState` 只记录 Telegram 当前对话上下文，不替代 AgentSession 或 Trip。

## 绑定与权限

收到 Telegram 消息后，系统用 `chat.id` 转成字符串，匹配 `UserSettings.telegramChatId`。

绑定规则：

- 没有用户绑定该 chat id：回复“请先在网站设置页填写 Telegram Chat ID: <chat.id>”。
- 恰好一个用户绑定：允许继续处理。
- 多个用户绑定同一个 chat id：拒绝处理，并提示检查设置，避免串号。

Telegram 入口不新增登录流程。用户需要先在网站登录并保存 Telegram Chat ID。

## 命令语义

支持命令：

- `/start`：返回绑定状态、当前行程状态和可用命令。
- `/new`：将该 chat 的 `mode` 设为 `awaiting_new_prompt`，清空 active session/trip；下一条普通文本按新行程规划处理。
- `/new <文本>`：立即用 `<文本>` 创建新的 AgentSession 和行程。
- `/trips`：列出最近可继续对话的行程，并用 Telegram 内联按钮切换当前 Telegram 对话绑定的行程。
- `/status`：返回当前 active session/trip、运行状态、行程标题、待提醒数量和网站链接。
- `/cancel`：取消当前 activeTrip 的监控，复用 `cancelTripMonitoring`，同时取消未发送提醒。
- 普通文本：
  - `mode=awaiting_new_prompt` 或没有 active session 时，按网站首页新建规划处理。
  - 有 active session/trip 时，按网站 Agent 续聊处理。

`/new` 默认不取消旧行程提醒，只切换 Telegram 当前对话上下文。旧行程仍按 ReminderJob 发送提醒；用户要停止旧提醒时使用 `/cancel`。这样避免开启新行程时无声丢掉上一段仍然需要的提醒。

## 行程切换按钮

`/trips` 返回最近 10 个可继续对话的行程，优先显示 `monitoring` 行程，其次显示最近创建的非 cancelled 行程。每条行程展示标题、目标到达时间、状态和待提醒数量。

每条行程下面提供一个内联按钮：

- 文案：`切换到此行程`
- `callback_data`：`sw:<tripId>`

点击按钮后的处理流程：

1. worker 收到 `callback_query`，读取 `data` 和按钮所属 `message.chat.id`。
2. 用 chat id 重新执行绑定校验，确认该 Telegram chat 只绑定一个应用用户。
3. 解析 `sw:<tripId>`，校验 Trip 属于该用户，且状态不是 `cancelled`。
4. 找到该 Trip 关联的最新 AgentSession；优先使用 `Trip.agentSessionId`，否则查找 `AgentSession.tripId=<tripId>` 的最新记录。
5. 如果该 Trip 没有关联 AgentSession，则为该 Trip 创建一个已完成的 continuation bootstrap AgentSession，`prompt` 写为 `Telegram 选择已有行程继续对话：<trip.title>`，`tripId` 指向该 Trip，并写入一条 assistant 消息说明“已从 Telegram 绑定到已有行程”。后续普通文本走现有续聊流程。
6. 更新 `TelegramChatState.activeTripId`、`activeAgentSessionId` 和 `mode=active`。
7. 调用 `answerCallbackQuery`，提示“已切换到：<trip.title>”。
8. 发送一条确认消息，说明后续普通文本会继续和该行程的 Agent 对话。

切换行程只改变 Telegram 当前对话上下文，不取消、不重建、不补发任何提醒。

## Agent 与消息流

新建规划：

1. Telegram 收到 `/new <文本>` 或新规划文本。
2. 校验绑定用户和默认出发点；缺出发点时回复引导去网站设置页。
3. 调用 `startPlanningSession` 创建 AgentSession。
4. 写入 `TelegramChatState.activeAgentSessionId`，`mode=active`。
5. 立即回复“已开始规划，我来处理。”
6. 调用 `runPlanningSession`。
7. 完成后更新 `activeTripId`，回复最终 assistant 摘要、行程标题、最迟出发时间、目标到达时间和网站链接。

续聊：

1. Telegram 收到普通文本，且当前 chat 有 active AgentSession。
2. 如果 AgentSession 仍是 `running`，回复“智能体还在处理，请稍后再发送新的消息”，不追加消息。
3. 否则调用 `acceptAgentSessionMessage`。
4. 立即回复“收到，我继续处理。”
5. 调用 `runAcceptedContinuationSession`。
6. 完成后回复最新 assistant 摘要和当前行程关键信息。

Telegram 不推送每个工具调用过程。完整过程仍在网站 Agent 页面展示。

## 错误处理

- Telegram API 失败：记录日志，worker 继续处理后续 update。
- Agent 失败或超时：把现有中文失败消息转发给 Telegram，并保留 AgentSession 中已有消息和工具日志。
- 数据库写入失败：不推进 `lastUpdateId`，让下一轮可重试；如果失败发生在消息已成功发送之后，允许按幂等规则重复发送一次错误提示。
- 未绑定或重复绑定：不创建 AgentSession，不修改 Trip。
- 收到非文本消息：回复“当前只支持文本规划和命令”。
- 无效或过期的行程切换按钮：调用 `answerCallbackQuery` 显示“这个行程已不可切换”，不修改 `TelegramChatState`。

## 与通知系统的关系

Telegram worker 只处理入站消息和 Agent 对话，不接管提醒。

提醒仍由 scheduler 处理：

- `ReminderJob` 到期后复算、写 `RecalculationLog`。
- 通过 `sendTelegram` 和 `sendEmail` 发送通知。
- 使用 `NotificationLog` 和 dedupe key 防止重复通知。

Telegram 续聊可能更新行程、替换路线或重建提醒；这些仍通过现有 Agent 工具和 `src/lib/trips` 服务完成。

## 测试策略

单元测试：

- Telegram 命令解析：`/start`、`/new`、`/new 文本`、`/trips`、`/status`、`/cancel`、普通文本。
- Telegram callback 解析：`sw:<tripId>`、未知动作、无效 trip id。
- Chat 绑定解析：未绑定、唯一绑定、重复绑定。
- `TelegramChatState` 状态切换：`idle`、`awaiting_new_prompt`、`active`。
- 长轮询 offset 计算和 `lastUpdateId` 持久化。
- Inline keyboard 构造：每个切换按钮的 `callback_data` 不超过 64 bytes。

集成测试：

- `/new 明天九点到外事学校` 创建 AgentSession 和 Trip，并更新 active state。
- `/new` 后下一条文本创建新行程。
- active session 下普通文本进入续聊流程。
- running session 下拒绝第二条普通消息。
- `/trips` 返回最近可继续对话的行程，并带 `切换到此行程` 按钮。
- 点击 `sw:<tripId>` 更新 active state，后续普通文本续聊被切换的行程。
- 点击不属于当前用户或已取消行程的按钮不修改 active state。
- `/cancel` 取消 activeTrip、TripLeg 和 scheduled ReminderJob。
- 未绑定 chat 不创建任何 AgentSession。

回归测试：

- 网站新建规划、网站续聊、设置页、调度器提醒、通知去重继续通过。
- 未配置 `TELEGRAM_BOT_TOKEN` 时，web、scheduler 和普通测试不受影响。

## 非目标

- 不实现 Telegram webhook。
- 不支持语音、图片、位置消息。
- 不在 Telegram 中展示完整工具调用时间线。
- 不新增 Telegram 账号登录或自动绑定流程。
- 不实现复杂分页；`/trips` v1 只返回最近 10 个可切换行程。
- 不重做现有提醒文案体系。

## 默认决策

- 部署方式：长轮询 worker。
- 身份绑定：复用 `UserSettings.telegramChatId`。
- `/new` 行为：只切换当前 Telegram 对话上下文，不取消旧提醒。
- 行程切换：通过 `/trips` 内联按钮更新当前 Telegram 对话绑定，不影响提醒。
- 取消提醒：显式 `/cancel`。
- 时间解释和展示：北京时间，`Asia/Shanghai`。
- Telegram v1 输入类型：仅文本。
