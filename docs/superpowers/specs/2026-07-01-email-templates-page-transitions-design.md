# 邮件模板与页面切换动效设计

日期：2026-07-01（北京时间）

## 目标

这次改动覆盖两个交付物：

1. 按 `前端样板和规范/邮件` 中的“到点提醒”和“时间更新”样板，完善真实通知邮件模板，并在完成后通过当前系统配置的收件邮箱各发送一封真实测试邮件。
2. 优化页面切换连贯性，重点解决首页提交行程后直接跳到 Agent 对话页过于生硬的问题。首页输入框应过渡成 Agent 页面里的首条用户消息。

## 范围

本次会实现真实邮件通知模板和轻量页面转场，不做邮件模板编辑器、不新增复杂动画库、不重做整体信息架构。

动效首批覆盖：

- 首页行程输入到 `/agent/[sessionId]` 的共享输入态过渡。
- 常规页面切换的轻量进入动效。
- 底部导航 active 状态的连贯反馈。

## 邮件模板设计

新增服务端邮件模板模块，输出 `subject`、`text`、`html` 三种内容。`sendEmail` 增加可选 `html` 字段，发送时同时带上纯文本与 HTML，以保证邮箱兼容性。

### 到点提醒模板

视觉结构对齐样板：

- 品牌头部：AI Commute / 通勤规划助手。
- Hero：行程提醒、该出发了、最晚出发时间。
- 关键事实：预计到达时间、预计行程时间、目的地。
- 补充信息：推荐路线、目的地天气。
- CTA：查看实时地图。
- Footer：自动发送说明和停止监控链接文案。

### 时间更新模板

视觉结构对齐样板：

- 顶部：行程提醒 + Lumina Velocity 风格品牌区。
- Hero：出发时间已更新、变化原因、变化分钟数、新最晚出发时间。
- 关键事实：预计到达时间、预计行程时间。
- 详情卡：目的地、推荐路线、天气。
- CTA 与 footer 同样保留。

### 数据来源

模板优先从 `DueReminderJob` 的 trip、leg、selectedCandidate 和 reminder payload 中取值：

- 目的地：`leg.destinationName`，再 fallback 到 `trip.finalStopName` / `trip.title`。
- 最晚出发：`leg.latestDepartAt`，到点提醒 fallback 到 `job.scheduledFor`。
- 预计到达：`trip.targetArriveAt`。
- 行程时间：`selectedCandidate.totalMinutes`，再 fallback 到 `routeMinutes`。
- 推荐路线：`selectedCandidate.title` 或分段摘要；缺失时显示“查看行程详情”。
- 天气：当前项目没有稳定天气快照字段，模板先使用“以行程详情为准”作为保守 fallback。

## 通知数据流

1. 调度器处理到点提醒时调用到点提醒模板。
2. 调度器处理路线复查且变化超过阈值时调用时间更新模板。
3. Telegram 继续使用纯文本 `content`，email 使用同一语义内容生成的 `text + html`。
4. 通知日志继续记录纯文本内容，避免日志保存大段 HTML。
5. 设置页“发送测试邮件”仍可用，后续会增加内部测试入口或脚本用于发送两封真实模板邮件。

## 页面转场设计

### 首页到 Agent

首页提交成功后：

1. 输入框进入 planning 状态，按钮显示加载。
2. 将 trimmed prompt 写入 `sessionStorage`，作为下一页的过渡上下文。
3. 若浏览器支持 View Transitions，则用同名 `view-transition-name` 让首页输入容器与 Agent 首条用户消息产生共享元素变形。
4. Agent 页读取 pending prompt，将首条请求渲染成用户消息气泡，而不是独立的“输入请求”摘要块。
5. Agent 事件列表随后淡入，工具调用和 assistant 消息沿当前时间线展示。

不支持 View Transitions 时，使用 CSS 淡入和轻微上移作为 fallback。

### 其它页面切换

`AppShell` 的主内容增加轻量进入动效：透明度从 0 到 1，纵向轻微位移回到原位。动画时间短，避免影响工具型应用的响应感。底部导航 active 项增加平滑背景/缩放反馈。

## 可访问性与降级

- 尊重 `prefers-reduced-motion: reduce`，关闭位移和共享元素过渡。
- 不依赖动画传递必要信息；无动画时页面仍完整可用。
- 首条用户消息仍使用真实文本节点，屏幕阅读器可读。
- 邮件模板使用内联样式和表格友好的布局，不依赖外部 CSS 或字体加载。

## 错误处理

- 邮件模板缺失字段时显示保守 fallback，不中断通知发送。
- `sendEmail` 保持现有 skipped/failed 结果结构。
- 真实测试邮件如果 SMTP 配置缺失或失败，返回明确错误并不伪装成功。
- 转场上下文读取失败时直接展示常规 Agent 页。

## 测试计划

自动化测试：

- 单元测试 `sendEmail` 会把 HTML 传给 nodemailer。
- 单元测试两个邮件模板包含核心标题、关键时间、目的地、CTA 与纯文本 fallback。
- 调度器集成测试断言到点提醒和时间更新通知调用 email 时包含 `html`。
- UI 测试断言首页提交会保存 pending prompt，并在 Agent 组件里以用户消息气泡展示。
- UI 测试断言 reduced-motion 下不会依赖转场类完成状态。

人工/真实验证：

- 构建或类型检查通过。
- 启动本地应用后，通过当前系统配置的邮箱收件人发送两封真实测试邮件：
  - 到点提醒测试邮件。
  - 时间更新测试邮件。

## 决策

采用“服务端模板模块 + `sendEmail(html)` + 首页到 Agent 共享输入态 + 全局轻量转场”的方案。这样既能保留样板视觉，又不会引入重型动画依赖或把邮件 HTML 混进调度业务逻辑。
