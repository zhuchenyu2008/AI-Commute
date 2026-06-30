# 本机一键部署脚本设计

日期：2026-06-30 19:14 北京时间

## 背景

Commute Planner 当前已经提供 Docker 部署方式：`docker compose up --build` 会构建应用、执行 Prisma migration，并同时运行 Web、scheduler 和 Telegram worker。用户希望新增一套和 Docker 同等级的本机部署方式，同时支持 Windows 和 Linux，并在启动前引导用户补齐缺失配置。

这套脚本面向本机生产部署，不替代 `npm run dev`。开发热更新仍然使用现有开发命令。

## 目标

- 在 Windows 和 Linux 上提供一键启动入口。
- 入口脚本作为 Docker 的并列部署方式，而不是临时开发辅助脚本。
- 首次运行或配置不完整时，引导用户补齐 `.env`。
- 高德地图和 AI Agent 配置必须完成，否则停止启动。
- 种子账号邮箱和密码允许留空；留空时由脚本随机生成并写入 `.env`。
- 自动完成依赖安装、Prisma 准备、生产构建和多进程启动。
- 同时运行 Web 服务、scheduler 循环和可用时的 Telegram worker。

## 非目标

- 不新增 Docker 相关行为。
- 不把脚本做成 Pinokio launcher。
- 不改变现有业务逻辑、数据库模型或 Docker Compose 服务定义。
- 不实现系统级守护进程、开机自启或后台服务安装。

## 入口与命令

新增以下文件：

- `start-all.ps1`：Windows PowerShell 本机部署入口。
- `start-all.cmd`：Windows 双击入口，调用 `start-all.ps1`。
- `start-all.sh`：Linux shell 本机部署入口。
- `scripts/start-all.mjs`：跨平台核心编排逻辑。

新增 npm 脚本：

- `npm run start:all`：调用 `node scripts/start-all.mjs`。

支持参数：

- `--configure`：强制进入配置向导，即使 `.env` 已存在。
- `--yes`：非交互模式。缺少必填配置时直接失败并说明缺哪些项；不会为高德或 AI Agent 配置编造值。

Windows 包装脚本映射：

- `.\start-all.ps1`
- `.\start-all.ps1 -Configure`
- `.\start-all.ps1 -Yes`
- `start-all.cmd`

Linux 包装脚本映射：

- `./start-all.sh`
- `./start-all.sh --configure`
- `./start-all.sh --yes`

## 配置向导

核心脚本负责读取 `.env.example` 和 `.env`。如果 `.env` 不存在，先基于 `.env.example` 创建初始配置，再进入校验和补全流程。

必填配置：

- `DATABASE_URL`：默认 `file:./data/commute.db`，用户可确认或修改。
- `DEFAULT_CITY`：默认沿用 `.env.example`，用户可确认或修改。
- `DEFAULT_TIMEZONE`：默认 `Asia/Shanghai`，用户可确认或修改。
- `AMAP_API_KEY`：必须由用户填写；为空时不继续启动。
- `OPENAI_API_KEY`：必须由用户填写；为空时不继续启动。
- `OPENAI_BASE_URL`：默认写入 `https://api.openai.com/v1`，用户可修改为兼容 OpenAI 的服务地址。
- `OPENAI_MODEL`：必须有值；默认沿用 `.env.example`，用户可确认或修改。

自动生成配置：

- `SEED_USER_EMAIL`：为空时生成 `user-<随机后缀>@example.local`。
- `SEED_USER_PASSWORD`：为空时生成强随机密码。
- `SCHEDULER_TICK_SECRET`：为空时生成强随机 secret。

可选配置：

- `TELEGRAM_BOT_TOKEN`：为空时不启动 Telegram worker，并在控制台明确提示。
- SMTP 相关配置：为空时邮件通知不可用，但不阻止 Web 和 scheduler 启动。

脚本写入 `.env` 后，会在控制台打印本次生成的种子账号邮箱和密码。密码只在生成时明确展示一次；之后用户可在 `.env` 中查看或修改。

## 启动流程

`scripts/start-all.mjs` 串行执行准备步骤：

1. 读取、创建或补全 `.env`。
2. 校验高德和 AI Agent 必填配置。
3. 运行 `npm install`。
4. 运行 `npm run prisma:generate`。
5. 运行 `npm run prisma:deploy`。
6. 运行 `npm run prisma:seed`。
7. 运行 `npm run build`。

准备完成后并发启动长期进程：

- Web：`npm run start`。
- Scheduler：每 60 秒执行一次 `npm run scheduler:tick`，失败时记录错误并等待下一轮。
- Telegram：仅当 `TELEGRAM_BOT_TOKEN` 非空时启动 `npm run telegram:poll`。

进程输出按服务名加前缀，例如 `[web]`、`[scheduler]`、`[telegram]`。用户按 Ctrl+C 时，核心脚本会向所有子进程发送终止信号并退出。

## 架构

包装脚本只负责定位仓库根目录并调用 Node 核心脚本。业务流程集中在 `scripts/start-all.mjs`，避免 Windows 和 Linux 逻辑分叉。

核心脚本拆分为小函数：

- 参数解析。
- `.env` 解析和序列化。
- 交互式提问。
- 必填配置校验。
- 随机值生成。
- 一次性命令执行。
- 长期进程管理。
- scheduler 循环管理。

这让后续测试可以直接覆盖配置解析、随机补全、参数行为和启动决策，而不需要真的启动 Next.js 服务。

## 错误处理

- 缺少 Node.js 或 npm 时，入口脚本给出明确错误。
- `.env` 写入失败时停止启动。
- 必填配置为空时停止启动，并列出缺失项。
- `npm install`、Prisma、seed 或 build 任一步失败时停止启动。
- Web 进程异常退出时，核心脚本终止其它长期进程并退出非零状态。
- Scheduler 单次 tick 失败不会终止整体服务，但会输出带前缀的错误。
- Telegram token 为空不会报错，只跳过 Telegram worker。

## 测试计划

自动化测试聚焦不需要真实外部服务的部分：

- `.env` 解析保留注释和键值更新行为。
- 空 `SEED_USER_EMAIL`、`SEED_USER_PASSWORD`、`SCHEDULER_TICK_SECRET` 会生成值。
- 缺少 `AMAP_API_KEY` 或 `OPENAI_API_KEY` 时校验失败。
- `--yes` 模式不会进入交互，也不会自动填充高德或 AI Agent 密钥。
- 未配置 `TELEGRAM_BOT_TOKEN` 时，启动计划跳过 Telegram worker。

手动验证：

- Windows：运行 `.\start-all.ps1`，完成向导后确认 Web、scheduler 和可选 Telegram 行为。
- Linux：运行 `chmod +x ./start-all.sh && ./start-all.sh`，完成向导后确认同样行为。
- 非交互模式：运行 `npm run start:all -- --yes`，确认缺必填项时失败信息清晰。

## README 更新

README 增加“本机一键部署”章节，与 Docker 章节并列。该章节说明：

- Windows 启动方式。
- Linux 启动方式。
- 首次运行配置向导。
- 高德和 AI Agent 配置为必填。
- 种子账号留空时会随机生成。
- Telegram 和 SMTP 是可选通知能力。
- 该方式使用生产构建，不等同于 `npm run dev`。
