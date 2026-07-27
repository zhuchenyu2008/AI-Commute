# Trip Share Card Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 放大分享图红框区域内的次级信息，并用路线条目的弹性间距填满正文方形区域，同时保持路线标题字号不变。

**Architecture:** 继续由 `TripShareCard` 负责纯展示，不引入新的运行时测量状态。正文容器使用现有 `540px` 最小高度，路线区域改为可占用剩余高度的 flex 子项；路线列表只在有空余高度时通过 `space-between` 分配条目间距。指标标签、指标数值、路线说明和分钟标签使用独立的基础字号与显式行高，继续乘以现有内容密度系数。

**Tech Stack:** React 19、Next.js 15、Tailwind CSS、Vitest、Playwright、html-to-image

---

## 文件结构

- `src/components/trips/trip-share-card.tsx`：调整红框区域的字号、行高、数据标记与 flex 填充布局。
- `tests/unit/trip-share-components.test.tsx`：锁定路线标题字号不变，并验证次级信息使用新的字号和布局标记。
- `tests/e2e/trip-sharing.spec.ts`：验证真实计算字号和最后一条路线与正文底部的距离。

### Task 1: 用失败测试锁定红框区域要求

**Files:**
- Modify: `tests/unit/trip-share-components.test.tsx`
- Modify: `tests/e2e/trip-sharing.spec.ts`

- [ ] **Step 1: 增加组件结构与字号回归断言**

在 `renders a bottom qr footer with brand text on the left` 测试中增加：

```tsx
expect(html).toContain('data-share-route-list="true"');
expect(html).toContain('data-share-metric-label="true"');
expect(html).toContain('data-share-metric-value="true"');
expect(html).toContain('data-share-segment-title="true"');
expect(html).toContain('data-share-segment-detail="true"');
expect(html).toContain('data-share-segment-minutes="true"');
expect(html).toContain("line-height:1.45");
```

其中路线标题仍调用 `scaledFontSize(14, fontScale)`；新的 `14px` 次级字号通过独立 data 属性在浏览器测试中区分，组件测试只验证对应节点存在和显式行高存在。

- [ ] **Step 2: 增加浏览器计算样式和底部空白断言**

扩展 `data-share-card` 的 `evaluate`：

```ts
const metricLabel = content.querySelector<HTMLElement>(
  '[data-share-metric-label="true"]'
);
const metricValue = content.querySelector<HTMLElement>(
  '[data-share-metric-value="true"]'
);
const segmentTitle = content.querySelector<HTMLElement>(
  '[data-share-segment-title="true"]'
);
const segmentDetail = content.querySelector<HTMLElement>(
  '[data-share-segment-detail="true"]'
);
const segmentMinutes = content.querySelector<HTMLElement>(
  '[data-share-segment-minutes="true"]'
);
const routeItems = content.querySelectorAll<HTMLElement>(
  '[data-share-route-item="true"]'
);
const lastRouteItem = routeItems.item(routeItems.length - 1);
```

返回以下测量值：

```ts
metricLabelFontSize: Number.parseFloat(getComputedStyle(metricLabel).fontSize),
metricValueFontSize: Number.parseFloat(getComputedStyle(metricValue).fontSize),
segmentTitleFontSize: Number.parseFloat(getComputedStyle(segmentTitle).fontSize),
segmentDetailFontSize: Number.parseFloat(getComputedStyle(segmentDetail).fontSize),
segmentMinutesFontSize: Number.parseFloat(getComputedStyle(segmentMinutes).fontSize),
contentBottom: content.getBoundingClientRect().bottom,
lastRouteBottom: lastRouteItem.getBoundingClientRect().bottom,
```

增加断言：

```ts
expect(layout.metricLabelFontSize).toBeGreaterThanOrEqual(15);
expect(layout.metricValueFontSize).toBeGreaterThanOrEqual(18);
expect(layout.segmentDetailFontSize).toBeGreaterThanOrEqual(15);
expect(layout.segmentMinutesFontSize).toBeGreaterThanOrEqual(15);
expect(layout.segmentTitleFontSize).toBeCloseTo(14 * 1.14, 1);
expect(layout.contentBottom - layout.lastRouteBottom).toBeLessThanOrEqual(40);
```

- [ ] **Step 3: 运行专项测试并确认失败**

Run:

```powershell
npm.cmd test -- --cache=false tests/unit/trip-share-components.test.tsx
npm.cmd run test:e2e -- tests/e2e/trip-sharing.spec.ts --reporter=line --workers=1
```

Expected: 单元测试因缺少新的 data 属性失败；E2E 因次级字号低于阈值或最后一条路线离正文底部超过 `40px` 失败。

### Task 2: 实现次级字号与弹性路线布局

**Files:**
- Modify: `src/components/trips/trip-share-card.tsx`

- [ ] **Step 1: 让路线区域占用正文剩余高度**

将路线 section 与列表改为：

```tsx
<section
  aria-label="路线步骤"
  className="mt-4 flex min-h-0 flex-1 flex-col"
>
  <ol
    className="flex min-h-0 flex-1 flex-col justify-between gap-4"
    data-share-route-list="true"
  >
```

每个路线项增加：

```tsx
data-share-route-item="true"
```

当内容高度不足 `540px` 时，`flex-1` 和 `justify-between` 分配剩余高度；内容本身较高时保留至少 `16px` 的条目间距并自然扩展。

- [ ] **Step 2: 保持路线标题字号并放大指标信息**

路线标题保持：

```tsx
data-share-segment-title="true"
style={{ fontSize: scaledFontSize(14, fontScale) }}
```

指标标签改为：

```tsx
data-share-metric-label="true"
style={{
  fontSize: scaledFontSize(14, fontScale),
  lineHeight: 1.35,
}}
```

指标数值改为：

```tsx
data-share-metric-value="true"
style={{
  fontSize: scaledFontSize(18, fontScale),
  lineHeight: 1.25,
}}
```

指标图标从 `size-4` 调整为 `size-[18px]`，与放大后的标签匹配。

- [ ] **Step 3: 放大路线说明和分钟标签并设置显式行高**

路线说明改为：

```tsx
data-share-segment-detail="true"
style={{
  fontSize: scaledFontSize(14, fontScale),
  lineHeight: 1.45,
}}
```

分钟标签改为：

```tsx
data-share-segment-minutes="true"
style={{
  fontSize: scaledFontSize(14, fontScale),
  lineHeight: 1.2,
}}
```

- [ ] **Step 4: 运行专项测试并确认通过**

Run:

```powershell
npm.cmd test -- --cache=false tests/unit/trip-share-components.test.tsx
npm.cmd run test:e2e -- tests/e2e/trip-sharing.spec.ts --reporter=line --workers=1
```

Expected: 组件测试通过，桌面和移动端 E2E 均通过；路线标题计算字号保持约 `15.96px`，次级文字达到新阈值，最后一条路线距正文底部不超过 `40px`。

- [ ] **Step 5: 提交功能改动**

```powershell
git add -- src/components/trips/trip-share-card.tsx tests/unit/trip-share-components.test.tsx tests/e2e/trip-sharing.spec.ts
git commit -m "fix: fill trip share card content area"
```

### Task 3: 视觉与全量回归验证

**Files:**
- No source changes expected

- [ ] **Step 1: 生成真实分享图并检查视觉结果**

从本地三段路线行程生成分享图，检查：路线标题未额外放大；三个指标、路线说明和分钟标签明显增大；最后一条路线接近正文底部；二维码栏结构未变化。

- [ ] **Step 2: 运行全量测试**

Run:

```powershell
npm.cmd test -- --cache=false
```

Expected: 全部测试通过，零失败。

- [ ] **Step 3: 运行生产构建**

Run:

```powershell
npm.cmd run build
```

Expected: Next.js 编译、类型检查和静态页面生成全部成功。

- [ ] **Step 4: 检查工作树并重启预览**

Run:

```powershell
git diff --check
git status --short --branch
```

Expected: 无未提交功能改动。随后从最新 `main` 在 `http://localhost:3200` 启动生产预览并确认 `/login` 返回 HTTP `200`。
