# 通勤反馈修复设计

日期：2026-06-30（北京时间）

## 背景

本次处理四个用户反馈：历史页日期选择后需要直接查询；过期行程不应继续显示“监控中”；首页主标题应展示当前所在位置；邮件测试遇到 `unable to verify the first certificate` 时需要判断配置与证书链问题。实现完成后，开发分支和临时文档需要在合并回 `main` 后清理干净。

## 方案

历史页继续使用现有 `date` 查询参数和 `getBeijingDayRange` 的北京时间日界逻辑。日期输入改为客户端自动提交：用户选择日期后立即导航到 `/history?date=YYYY-MM-DD`，页面直接渲染当天行程；保留无脚本情况下的表单提交能力，但不再要求用户点击“查看”。

过期行程显示统一走共享状态 helper。当前详情页和首页实时卡已有过期判断，但历史列表和首页最近历史仍直接使用原始 `trip.status`。新增或扩展共享格式化函数，按 `targetArriveAt < now` 将 `monitoring` / `scheduled` 展示为“已过期”，并给出对应样式。数据库状态不在本次变更中批量回写，避免把展示问题变成数据迁移。

首页头部上方保留“当前位置”标签，主标题展示 `settings.originName ?? settings.defaultCity`。这样当前位置仍是第一屏主信号，同时不重复显示同一位置。

邮件测试保持严格 TLS 校验。新增受控环境变量 `SMTP_TLS_USE_SYSTEM_CA=true`，开启后在 Node 运行时使用系统根证书能力；同时把 Node 证书链错误转成更明确的中文诊断，提示检查 SMTP 服务器完整证书链或使用系统 CA。默认不加入 `rejectUnauthorized: false`。

## 测试

新增/更新单元测试覆盖：

- 历史页日期选择组件会在选择日期后自动提交。
- 历史摘要和历史页状态 helper 会把过期监控/计划行程显示为“已过期”。
- 首页当前位置标题组件展示位置名称。
- 邮件发送会读取系统 CA 开关，并将 `unable to verify the first certificate` 映射为可操作错误。

最后运行 `npm.cmd test` 和 `npm.cmd run lint`。如时间允许，再运行 `npm.cmd run build` 验证生产构建。

## 清理策略

开发在 `codex/commute-feedback` 分支与 `.worktrees/codex-commute-feedback` 工作区中完成。合并回 `main` 前删除本次新增的 Superpowers 临时设计/计划文档，使最终 `main` 只留下产品代码和测试变更。合并后删除本地开发分支并移除 worktree。
