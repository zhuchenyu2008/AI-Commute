# 行程分享功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为行程增加可撤销的公开只读链接，并允许所有者生成底部左侧品牌提示、右侧二维码的 PNG 分享图。

**Architecture:** 使用 Prisma `TripShare` 保存每条行程唯一的公开令牌和撤销状态。服务端通过受限数据投影同时服务无登录公开页面与所有者分享组件；浏览器端使用 `qrcode` 和 `html-to-image` 生成宽度 1080px、正文区域保持 1:1、二维码栏额外增加高度且整图最高不超过 9:16 的 PNG。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、Prisma/SQLite、Vitest、Testing Library、Playwright、`qrcode`、`html-to-image`。

---

## 文件结构

- `prisma/schema.prisma`：声明 `TripShare` 与 `Trip` 的一对一关系。
- `prisma/migrations/20260720120000_trip_shares/migration.sql`：创建分享表、唯一索引和级联外键。
- `src/lib/trips/share-types.ts`：公开数据的纯 TypeScript 类型。
- `src/lib/trips/share-view.ts`：从行程查询结果映射为公开数据，不依赖浏览器。
- `src/lib/trips/share-service.ts`：令牌生成、所有者校验、启用、撤销和公开读取。
- `src/lib/trips/share-image.ts`：图片尺寸、路线折叠和文件名纯函数。
- `app/api/trips/[tripId]/share/route.ts`：所有者分享状态 API。
- `app/share/[token]/page.tsx`：无需登录的公开只读页面。
- `src/components/trips/public-trip-share.tsx`：公开页面的行程内容组件。
- `src/components/trips/trip-share-card.tsx`：导出图片专用卡片，包含底部二维码栏。
- `src/components/trips/trip-share-button.tsx`：分享弹层、复制、下载、系统分享和关闭分享。
- `app/trips/[tripId]/page.tsx`：在详情页标题区接入分享按钮并传入受限数据。
- `tests/unit/trip-share.test.ts`：公开投影、令牌和图片尺寸纯函数测试。
- `tests/integration/trip-share-api.test.ts`：数据库生命周期和 API 权限测试。
- `tests/unit/trip-share-components.test.tsx`：公开视图、二维码栏和分享弹层测试。
- `tests/e2e/trip-sharing.spec.ts`：真实浏览器公开访问、撤销和图片导出流程。

### Task 1：增加 TripShare 数据模型

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260720120000_trip_shares/migration.sql`
- Modify: `tests/integration/prisma-schema.test.ts`

- [ ] **Step 1：先写失败的 schema 测试**

在 `tests/integration/prisma-schema.test.ts` 顶层读取迁移文件：

```ts
const tripShareMigration = readFileSync(
  "prisma/migrations/20260720120000_trip_shares/migration.sql",
  "utf8"
);
```

增加测试：

```ts
it("stores one revocable public share per trip", () => {
  expect(schema).toContain("model TripShare");
  expect(schema).toContain("share             TripShare?");
  expect(schema).toContain("tripId    String   @unique");
  expect(schema).toContain("token     String   @unique");
  expect(schema).toContain("revokedAt DateTime?");
  expect(tripShareMigration).toContain('CREATE TABLE "TripShare"');
  expect(tripShareMigration).toContain(
    'FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE'
  );
  expect(tripShareMigration).toContain(
    'CREATE UNIQUE INDEX "TripShare_tripId_key"'
  );
  expect(tripShareMigration).toContain(
    'CREATE UNIQUE INDEX "TripShare_token_key"'
  );
});
```

- [ ] **Step 2：运行测试并确认失败**

Run: `npm test -- tests/integration/prisma-schema.test.ts`

Expected: FAIL，原因是迁移文件不存在或 schema 中没有 `TripShare`。

- [ ] **Step 3：实现 Prisma 模型与迁移**

在 `Trip` 关系字段中增加：

```prisma
share              TripShare?
```

在 `prisma/schema.prisma` 增加：

```prisma
model TripShare {
  id        String    @id @default(cuid())
  tripId    String    @unique
  token     String    @unique
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  trip      Trip      @relation(fields: [tripId], references: [id], onDelete: Cascade)

  @@index([revokedAt])
}
```

创建迁移：

```sql
CREATE TABLE "TripShare" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tripId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TripShare_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TripShare_tripId_key" ON "TripShare"("tripId");
CREATE UNIQUE INDEX "TripShare_token_key" ON "TripShare"("token");
CREATE INDEX "TripShare_revokedAt_idx" ON "TripShare"("revokedAt");
```

- [ ] **Step 4：生成客户端并运行测试**

Run: `npm run prisma:generate`

Expected: Prisma Client generated successfully。

Run: `npm test -- tests/integration/prisma-schema.test.ts`

Expected: PASS。

- [ ] **Step 5：提交数据模型**

```bash
git add prisma/schema.prisma prisma/migrations/20260720120000_trip_shares/migration.sql tests/integration/prisma-schema.test.ts
git commit -m "feat: add trip share persistence"
```

### Task 2：实现令牌、公开投影与分享生命周期

**Files:**
- Create: `src/lib/trips/share-types.ts`
- Create: `src/lib/trips/share-view.ts`
- Create: `src/lib/trips/share-service.ts`
- Create: `tests/unit/trip-share.test.ts`
- Create: `tests/integration/trip-share-api.test.ts`

- [ ] **Step 1：写令牌与公开投影的失败测试**

在 `tests/unit/trip-share.test.ts` 创建测试：

```ts
import { describe, expect, it } from "vitest";
import { createTripShareToken } from "@/lib/trips/share-service";
import { toPublicTripShareData } from "@/lib/trips/share-view";

describe("trip sharing domain", () => {
  it("creates an opaque 192-bit Base64URL token", () => {
    const token = createTripShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(createTripShareToken()).not.toBe(token);
  });

  it("projects only public trip fields", () => {
    const source = {
      title: "今晚到城市美术馆",
      timezone: "Asia/Shanghai",
      targetArriveAt: new Date("2026-07-20T10:50:00.000Z"),
      finalStopName: "城市美术馆",
      rawPrompt: "private prompt",
      stops: [
        { order: 0, name: "演示小区北门", lngLat: "121,29", notes: "private" },
        { order: 1, name: "城市美术馆", lngLat: "122,30", notes: null },
      ],
      legs: [
        {
          order: 0,
          originName: "演示小区北门",
          destinationName: "城市美术馆",
          latestDepartAt: new Date("2026-07-20T10:05:00.000Z"),
          targetArriveAt: new Date("2026-07-20T10:50:00.000Z"),
          selectedCandidate: {
            title: "地铁优先",
            mode: "transit",
            routeMinutes: 37,
            bufferMinutes: 8,
          },
          routeCandidates: [],
          routeSegments: [
            { order: 0, mode: "walk", title: "步行到地铁站", detail: "6 分钟", minutes: 6 },
          ],
        },
      ],
    };

    const result = toPublicTripShareData(source);
    const json = JSON.stringify(result);

    expect(result.totalMinutes).toBe(45);
    expect(result.stops.map((stop) => stop.name)).toEqual([
      "演示小区北门",
      "城市美术馆",
    ]);
    expect(json).not.toContain("private prompt");
    expect(json).not.toContain("121,29");
    expect(json).not.toContain("private");
  });
});
```

- [ ] **Step 2：运行单元测试并确认失败**

Run: `npm test -- tests/unit/trip-share.test.ts`

Expected: FAIL，原因是分享模块不存在。

- [ ] **Step 3：定义公开类型**

在 `src/lib/trips/share-types.ts` 定义：

```ts
export type PublicTripShareSegment = {
  mode: string;
  title: string;
  detail: string | null;
  minutes: number;
};

export type PublicTripShareLeg = {
  originName: string;
  destinationName: string;
  latestDepartAt: string | null;
  targetArriveAt: string | null;
  routeTitle: string | null;
  routeMode: string | null;
  routeMinutes: number;
  bufferMinutes: number;
  segments: PublicTripShareSegment[];
};

export type PublicTripShareData = {
  title: string;
  timezone: string;
  targetArriveAt: string | null;
  finalStopName: string | null;
  totalRouteMinutes: number;
  totalBufferMinutes: number;
  totalMinutes: number;
  stops: Array<{ name: string }>;
  legs: PublicTripShareLeg[];
};
```

- [ ] **Step 4：实现纯公开投影**

在 `src/lib/trips/share-view.ts` 定义 `TripShareSource`，仅声明映射所需字段；实现候选路线回退顺序为 `selectedCandidate`、`selected === true`、第一条候选：

```ts
import type { PublicTripShareData } from "@/lib/trips/share-types";

type Candidate = {
  title: string;
  mode: string;
  routeMinutes: number;
  bufferMinutes: number;
  selected?: boolean;
};

export type TripShareSource = {
  title: string;
  timezone: string;
  targetArriveAt: Date | null;
  finalStopName: string | null;
  stops: Array<{ order: number; name: string }>;
  legs: Array<{
    order: number;
    originName: string;
    destinationName: string;
    latestDepartAt: Date | null;
    targetArriveAt: Date | null;
    selectedCandidate: Candidate | null;
    routeCandidates: Candidate[];
    routeSegments: Array<{
      order: number;
      mode: string;
      title: string;
      detail: string | null;
      minutes: number;
    }>;
  }>;
};

function toIso(value: Date | null) {
  return value?.toISOString() ?? null;
}

export function toPublicTripShareData(
  source: TripShareSource
): PublicTripShareData {
  const legs = [...source.legs]
    .sort((a, b) => a.order - b.order)
    .map((leg) => {
      const candidate =
        leg.selectedCandidate ??
        leg.routeCandidates.find((item) => item.selected) ??
        leg.routeCandidates[0] ??
        null;

      return {
        originName: leg.originName,
        destinationName: leg.destinationName,
        latestDepartAt: toIso(leg.latestDepartAt),
        targetArriveAt: toIso(leg.targetArriveAt),
        routeTitle: candidate?.title ?? null,
        routeMode: candidate?.mode ?? null,
        routeMinutes: candidate?.routeMinutes ?? 0,
        bufferMinutes: candidate?.bufferMinutes ?? 0,
        segments: [...leg.routeSegments]
          .sort((a, b) => a.order - b.order)
          .map(({ mode, title, detail, minutes }) => ({
            mode,
            title,
            detail,
            minutes,
          })),
      };
    });
  const totalRouteMinutes = legs.reduce(
    (sum, leg) => sum + leg.routeMinutes,
    0
  );
  const totalBufferMinutes = legs.reduce(
    (sum, leg) => sum + leg.bufferMinutes,
    0
  );

  return {
    title: source.title,
    timezone: source.timezone,
    targetArriveAt: toIso(source.targetArriveAt),
    finalStopName: source.finalStopName,
    totalRouteMinutes,
    totalBufferMinutes,
    totalMinutes: totalRouteMinutes + totalBufferMinutes,
    stops: [...source.stops]
      .sort((a, b) => a.order - b.order)
      .map(({ name }) => ({ name })),
    legs,
  };
}
```

- [ ] **Step 5：实现分享服务**

在 `src/lib/trips/share-service.ts` 使用 `randomBytes(24)` 生成令牌，并实现以下导出：

```ts
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { toPublicTripShareData } from "@/lib/trips/share-view";

export class TripShareNotFoundError extends Error {}

export function createTripShareToken() {
  return randomBytes(24).toString("base64url");
}

async function assertOwnedTrip(tripId: string, userId: string) {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    select: { id: true },
  });
  if (!trip) throw new TripShareNotFoundError();
}

export async function getTripShareState(tripId: string, userId: string) {
  await assertOwnedTrip(tripId, userId);
  return prisma.tripShare.findUnique({ where: { tripId } });
}

export async function enableTripShare(tripId: string, userId: string) {
  await assertOwnedTrip(tripId, userId);
  const existing = await prisma.tripShare.findUnique({ where: { tripId } });
  if (existing && !existing.revokedAt) return existing;

  return prisma.tripShare.upsert({
    where: { tripId },
    create: { tripId, token: createTripShareToken() },
    update: { token: createTripShareToken(), revokedAt: null },
  });
}

export async function revokeTripShare(tripId: string, userId: string) {
  await assertOwnedTrip(tripId, userId);
  const existing = await prisma.tripShare.findUnique({ where: { tripId } });
  if (!existing) return null;
  return prisma.tripShare.update({
    where: { tripId },
    data: { revokedAt: new Date() },
  });
}
```

在同一文件使用固定 `include` 查询行程、站点、路线候选与分段，并导出：

```ts
export async function getPublicTripShareByToken(token: string) {
  const share = await prisma.tripShare.findFirst({
    where: { token, revokedAt: null },
    include: {
      trip: {
        include: {
          stops: { orderBy: { order: "asc" } },
          legs: {
            orderBy: { order: "asc" },
            include: {
              selectedCandidate: true,
              routeCandidates: { orderBy: { createdAt: "asc" } },
              routeSegments: { orderBy: { order: "asc" } },
            },
          },
        },
      },
    },
  });
  return share ? toPublicTripShareData(share.trip) : null;
}
```

- [ ] **Step 6：运行单元测试**

Run: `npm test -- tests/unit/trip-share.test.ts`

Expected: PASS。

- [ ] **Step 7：提交领域层**

```bash
git add src/lib/trips/share-types.ts src/lib/trips/share-view.ts src/lib/trips/share-service.ts tests/unit/trip-share.test.ts
git commit -m "feat: add trip share domain service"
```

### Task 3：实现所有者分享 API

**Files:**
- Create: `app/api/trips/[tripId]/share/route.ts`
- Create: `tests/integration/trip-share-api.test.ts`

- [ ] **Step 1：写 API 生命周期失败测试**

测试使用真实测试数据库并 mock `getCurrentUser`，覆盖：

```ts
it("creates one stable link, revokes it, and rotates the token on re-enable", async () => {
  const { GET, POST, DELETE } = await import(
    "@app/api/trips/[tripId]/share/route"
  );
  getCurrentUserMock.mockResolvedValue(owner);
  const context = { params: Promise.resolve({ tripId: trip.id }) };

  const first = await POST(new Request("http://localhost:3000/api/trips/x/share"), context);
  const second = await POST(new Request("http://localhost:3000/api/trips/x/share"), context);
  const firstBody = await first.json();
  const secondBody = await second.json();
  expect(firstBody.url).toBe(secondBody.url);

  expect((await DELETE(new Request("http://localhost"), context)).status).toBe(200);
  expect((await GET(new Request("http://localhost"), context)).json()).resolves.toMatchObject({
    enabled: false,
    url: null,
  });

  const reenabled = await POST(
    new Request("http://localhost:3000/api/trips/x/share"),
    context
  );
  expect((await reenabled.json()).url).not.toBe(firstBody.url);
});
```

另写未登录返回 `401`、其他用户返回 `404`、删除行程后 `TripShare` 计数为 `0` 的测试。

- [ ] **Step 2：运行集成测试并确认失败**

Run: `$env:DATABASE_URL='file:./trip-share-api-test.db'; npm test -- tests/integration/trip-share-api.test.ts`

Expected: FAIL，原因是 API route 不存在。

- [ ] **Step 3：实现 GET、POST、DELETE**

在 route 中使用统一响应构造：

```ts
function publicUrl(request: Request, token: string) {
  return new URL(`/share/${token}`, request.url).toString();
}

function responseFor(request: Request, share: { token: string; revokedAt: Date | null } | null) {
  const enabled = Boolean(share && !share.revokedAt);
  return NextResponse.json({
    enabled,
    url: enabled && share ? publicUrl(request, share.token) : null,
  });
}
```

每个 handler 先调用 `getCurrentUser()`；未登录返回 `401`。捕获 `TripShareNotFoundError` 返回 `404`，其他异常返回 `500` 和稳定中文错误文案。

- [ ] **Step 4：运行集成测试**

Run: `$env:DATABASE_URL='file:./trip-share-api-test.db'; npm test -- tests/integration/trip-share-api.test.ts`

Expected: PASS。

- [ ] **Step 5：提交 API**

```bash
git add app/api/trips/[tripId]/share/route.ts tests/integration/trip-share-api.test.ts
git commit -m "feat: add trip share owner api"
```

### Task 4：实现无登录公开只读页面

**Files:**
- Create: `src/components/trips/public-trip-share.tsx`
- Create: `app/share/[token]/page.tsx`
- Create: `tests/unit/trip-share-components.test.tsx`

- [ ] **Step 1：写公开页面组件失败测试**

使用 `renderToStaticMarkup` 渲染 `PublicTripShare`，断言：

```ts
const html = renderToStaticMarkup(<PublicTripShare trip={sampleTrip} />);
expect(html).toContain("公开只读");
expect(html).toContain("今晚到城市美术馆");
expect(html).toContain("步行到地铁站");
expect(html).not.toContain("取消监控");
expect(html).not.toContain("智能体对话");
expect(html).not.toContain("删除行程");
```

- [ ] **Step 2：运行测试并确认失败**

Run: `npm test -- tests/unit/trip-share-components.test.tsx`

Expected: FAIL，原因是公开组件不存在。

- [ ] **Step 3：实现公开内容组件**

`PublicTripShare` 使用现有 `RouteTimeline`，将 ISO 时间转回 `Date` 后调用 `formatTimeInTimeZone`。组件顶层包含：

```tsx
const firstLeg = trip.legs[0];
const routeGroups = trip.legs.map((leg, index) => ({
  title: `${leg.originName} 到 ${leg.destinationName}`,
  subtitle: leg.targetArriveAt
    ? `${formatTimeInTimeZone(new Date(leg.targetArriveAt), trip.timezone)} 前到达`
    : null,
  segments: leg.segments.map((segment) => ({
    ...segment,
    id: `${index}-${segment.title}`,
  })),
}));

<main className="min-h-dvh bg-[#f7f9fb] px-5 py-8 text-[#191c1e]">
  <div className="mx-auto max-w-3xl space-y-5">
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#2563eb]">AI Commute</p>
        <h1 className="mt-2 break-words text-3xl font-bold">{trip.title}</h1>
      </div>
      <span className="shrink-0 rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-bold text-[#166534]">
        公开只读
      </span>
    </header>
    <section className="grid grid-cols-3 gap-3 rounded-2xl bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs text-[#737686]">最晚出发</p>
        <p className="mt-1 font-bold">
          {formatTimeInTimeZone(
            firstLeg?.latestDepartAt ? new Date(firstLeg.latestDepartAt) : null,
            trip.timezone
          )}
        </p>
      </div>
      <div>
        <p className="text-xs text-[#737686]">目标到达</p>
        <p className="mt-1 font-bold">
          {formatTimeInTimeZone(
            trip.targetArriveAt ? new Date(trip.targetArriveAt) : null,
            trip.timezone
          )}
        </p>
      </div>
      <div>
        <p className="text-xs text-[#737686]">预计用时</p>
        <p className="mt-1 font-bold">{trip.totalMinutes} 分钟</p>
      </div>
    </section>
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      {routeGroups.some((group) => group.segments.length > 0) ? (
        <RouteTimeline groups={routeGroups} />
      ) : (
        <p className="text-sm text-[#434655]">路线详情待完善</p>
      )}
    </section>
    <p className="text-xs leading-5 text-[#737686]">
      此页面仅供查看，内容可能随行程更新。
    </p>
  </div>
</main>
```

三项摘要分别为最晚出发、目标到达、预计用时。路线为空时显示“路线详情待完善”。

- [ ] **Step 4：实现公开路由和失效状态**

`app/share/[token]/page.tsx`：

```tsx
import type { Metadata } from "next";
import { PublicTripShare } from "@/components/trips/public-trip-share";
import { getPublicTripShareByToken } from "@/lib/trips/share-service";

export const metadata: Metadata = {
  title: "公开行程 | AI Commute",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trip = await getPublicTripShareByToken(token);

  if (!trip) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f7f9fb] p-5">
        <section className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#191c1e]">分享链接无效或已关闭</h1>
          <p className="mt-2 text-sm text-[#434655]">请联系行程分享者获取新的链接。</p>
        </section>
      </main>
    );
  }

  return <PublicTripShare trip={trip} />;
}
```

- [ ] **Step 5：运行组件和类型测试**

Run: `npm test -- tests/unit/trip-share-components.test.tsx`

Expected: PASS。

Run: `npm run lint`

Expected: TypeScript exits 0。

- [ ] **Step 6：提交公开页面**

```bash
git add src/components/trips/public-trip-share.tsx app/share/[token]/page.tsx tests/unit/trip-share-components.test.tsx
git commit -m "feat: add public trip share page"
```

### Task 5：实现分享图片尺寸与路线折叠规则

**Files:**
- Create: `src/lib/trips/share-image.ts`
- Modify: `tests/unit/trip-share.test.ts`

- [ ] **Step 1：写尺寸和文件名失败测试**

```ts
import {
  buildShareImageFileName,
  getShareCardLayout,
} from "@/lib/trips/share-image";

it("prefers square output and never exceeds 9:16", () => {
  expect(getShareCardLayout(3)).toEqual({
    logicalHeight: 540,
    visibleSegmentCount: 3,
    hiddenSegmentCount: 0,
  });
  const long = getShareCardLayout(30);
  expect(long.logicalHeight).toBeLessThanOrEqual(960);
  expect(long.visibleSegmentCount).toBe(8);
  expect(long.hiddenSegmentCount).toBe(22);
});

it("builds a filesystem-safe Beijing-date PNG name", () => {
  expect(
    buildShareImageFileName(
      "家/公司:晚班",
      new Date("2026-07-20T03:30:00.000Z")
    )
  ).toBe("AI-Commute-家公司晚班-2026-07-20.png");
});
```

- [ ] **Step 2：运行测试并确认失败**

Run: `npm test -- tests/unit/trip-share.test.ts`

Expected: FAIL，原因是 `share-image` 不存在。

- [ ] **Step 3：实现纯函数**

```ts
export const SHARE_CARD_LOGICAL_WIDTH = 540;
export const SHARE_CARD_MIN_HEIGHT = 540;
export const SHARE_CARD_MAX_HEIGHT = 960;
export const SHARE_CARD_PIXEL_RATIO = 2;

export function getShareCardLayout(segmentCount: number) {
  const safeCount = Math.max(0, segmentCount);
  const visibleSegmentCount = Math.min(safeCount, 8);
  const hiddenSegmentCount = safeCount - visibleSegmentCount;
  const logicalHeight = Math.min(
    SHARE_CARD_MAX_HEIGHT,
    Math.max(
      SHARE_CARD_MIN_HEIGHT,
      SHARE_CARD_MIN_HEIGHT + Math.max(0, visibleSegmentCount - 4) * 90
    )
  );
  return { logicalHeight, visibleSegmentCount, hiddenSegmentCount };
}

export function buildShareImageFileName(title: string, now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const safeTitle = title.replace(/[\\/:*?"<>|\s]+/g, "").slice(0, 40) || "行程";
  return `AI-Commute-${safeTitle}-${date}.png`;
}
```

- [ ] **Step 4：运行单元测试**

Run: `npm test -- tests/unit/trip-share.test.ts`

Expected: PASS。

- [ ] **Step 5：提交图片规则**

```bash
git add src/lib/trips/share-image.ts tests/unit/trip-share.test.ts
git commit -m "feat: define trip share image layout"
```

### Task 6：实现带二维码底栏的分享卡片

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/components/trips/trip-share-card.tsx`
- Modify: `tests/unit/trip-share-components.test.tsx`

- [ ] **Step 1：安装图片依赖**

Run: `npm install qrcode html-to-image`

Run: `npm install --save-dev @types/qrcode`

Expected: `package.json` 包含 `qrcode`、`html-to-image` 和 `@types/qrcode`。

- [ ] **Step 2：写二维码底栏失败测试**

```ts
const html = renderToStaticMarkup(
  <TripShareCard
    layout={getShareCardLayout(sampleTrip.legs[0].segments.length)}
    qrDataUrl="data:image/png;base64,qr"
    trip={sampleTrip}
  />
);

const brandIndex = html.indexOf("AI Commute");
const hintIndex = html.indexOf("扫码查看完整行程");
const qrIndex = html.indexOf('data-share-qr="true"');
expect(html).toContain('data-share-qr-footer="true"');
expect(brandIndex).toBeGreaterThan(-1);
expect(hintIndex).toBeGreaterThan(brandIndex);
expect(qrIndex).toBeGreaterThan(hintIndex);
expect(html).not.toContain("gradient");
```

- [ ] **Step 3：运行测试并确认失败**

Run: `npm test -- tests/unit/trip-share-components.test.tsx`

Expected: FAIL，原因是 `TripShareCard` 不存在。

- [ ] **Step 4：实现分享卡片**

`TripShareCard` 在渲染前将所有分段扁平化，并按 `layout.visibleSegmentCount` 截取：

```ts
const allSegments = trip.legs.flatMap((leg) => leg.segments);
const visibleSegments = allSegments.slice(0, layout.visibleSegmentCount);
const latestDepartAt = trip.legs[0]?.latestDepartAt;
const latestDepartLabel = formatTimeInTimeZone(
  latestDepartAt ? new Date(latestDepartAt) : null,
  trip.timezone
);
const targetArriveLabel = formatTimeInTimeZone(
  trip.targetArriveAt ? new Date(trip.targetArriveAt) : null,
  trip.timezone
);
```

卡片根节点使用固定逻辑尺寸：

```tsx
<article
  className="flex flex-col overflow-hidden bg-[#f7f9fb] text-[#191c1e]"
  data-share-card="true"
  style={{ width: 540, height: layout.logicalHeight }}
>
  <div className="flex min-w-0 flex-1 flex-col p-8">
    <header className="flex items-start justify-between gap-4">
      <p className="text-lg font-bold text-[#2563eb]">AI Commute</p>
      <span className="rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-bold text-[#166534]">
        公开只读
      </span>
    </header>
    <h1 className="mt-5 line-clamp-2 text-3xl font-bold leading-tight">
      {trip.title}
    </h1>
    <section className="mt-5 grid grid-cols-3 gap-3 border-y border-[#e0e3e5] py-4">
      <div><p className="text-xs text-[#737686]">最晚出发</p><p className="mt-1 font-bold">{latestDepartLabel}</p></div>
      <div><p className="text-xs text-[#737686]">目标到达</p><p className="mt-1 font-bold">{targetArriveLabel}</p></div>
      <div><p className="text-xs text-[#737686]">预计用时</p><p className="mt-1 font-bold">{trip.totalMinutes} 分钟</p></div>
    </section>
    <ol className="mt-5 min-h-0 flex-1 space-y-3 overflow-hidden">
      {visibleSegments.map((segment, index) => (
        <li className="flex items-start gap-3" key={`${segment.title}-${index}`}>
          <span className="mt-1 size-2 shrink-0 rounded-full bg-[#2563eb]" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-bold">{segment.title}</p>
            <p className="text-xs text-[#737686]">{segment.minutes} 分钟</p>
          </div>
        </li>
      ))}
      {layout.hiddenSegmentCount > 0 ? (
        <li className="text-xs font-semibold text-[#737686]">
          另有 {layout.hiddenSegmentCount} 个路线步骤
        </li>
      ) : null}
    </ol>
  </div>
  <footer
    className="flex h-[108px] shrink-0 items-center justify-between gap-5 border-t border-[#e0e3e5] bg-white px-8"
    data-share-qr-footer="true"
  >
    <div className="min-w-0">
      <p className="text-lg font-bold text-[#191c1e]">AI Commute</p>
      <p className="mt-1 text-sm font-medium text-[#737686]">
        扫码查看完整行程
      </p>
    </div>
    <div className="shrink-0 bg-white p-2">
      <img
        alt="公开行程二维码"
        className="size-[84px]"
        data-share-qr="true"
        src={qrDataUrl}
      />
    </div>
  </footer>
</article>
```

根节点方向必须为纵向 `flex-col`；footer 保持底部全宽。仅参考用户图片的左文右码布局，不复制其视觉风格。

- [ ] **Step 5：运行组件测试**

Run: `npm test -- tests/unit/trip-share-components.test.tsx`

Expected: PASS。

- [ ] **Step 6：提交分享卡片**

```bash
git add package.json package-lock.json src/components/trips/trip-share-card.tsx tests/unit/trip-share-components.test.tsx
git commit -m "feat: add qr trip share card"
```

### Task 7：实现分享弹层、图片导出与详情页入口

**Files:**
- Create: `src/components/trips/trip-share-button.tsx`
- Modify: `app/trips/[tripId]/page.tsx`
- Modify: `tests/unit/trip-share-components.test.tsx`
- Modify: `tests/unit/ui-components.test.tsx`

- [ ] **Step 1：写分享弹层失败测试**

mock `qrcode`、`html-to-image`、`fetch`、剪贴板和下载链接，验证：

```ts
fireEvent.click(screen.getByRole("button", { name: "分享行程" }));
fireEvent.click(screen.getByRole("button", { name: "复制公开链接" }));
await waitFor(() => {
  expect(fetchMock).toHaveBeenCalledWith("/api/trips/trip-1/share", {
    method: "POST",
  });
  expect(writeTextMock).toHaveBeenCalledWith(
    "http://localhost:3000/share/public-token"
  );
});

fireEvent.click(screen.getByRole("button", { name: "生成分享图" }));
await waitFor(() => expect(toPngMock).toHaveBeenCalled());
expect(downloadMock).toHaveBeenCalledWith(
  expect.stringMatching(/^AI-Commute-.*\.png$/),
  "data:image/png;base64,share"
);
```

另测 `DELETE` 后显示“分享已关闭”，以及剪贴板失败时渲染可选中的链接输入框。

- [ ] **Step 2：运行测试并确认失败**

Run: `npm test -- tests/unit/trip-share-components.test.tsx tests/unit/ui-components.test.tsx`

Expected: FAIL，原因是分享按钮不存在。

- [ ] **Step 3：实现分享链接状态机**

`TripShareButton` 接收：

```ts
type TripShareButtonProps = {
  tripId: string;
  trip: PublicTripShareData;
};
```

实现 `ensureShareUrl()`：有本地 URL 时直接返回，否则 `POST /api/trips/${tripId}/share`。打开弹层时 `GET` 查询当前状态。复制使用 `navigator.clipboard.writeText`，失败时设置 `showManualUrl=true`。

- [ ] **Step 4：实现二维码和 PNG 生成**

先在 `trip-share-button.tsx` 定义下载与文件转换辅助函数：

```ts
function downloadDataUrl(fileName: string, dataUrl: string) {
  const anchor = document.createElement("a");
  anchor.download = fileName;
  anchor.href = dataUrl;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function dataUrlToFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: "image/png" });
}
```

图片生成流程：

```ts
const url = await ensureShareUrl();
const qr = await QRCode.toDataURL(url, {
  errorCorrectionLevel: "M",
  margin: 4,
  width: 192,
  color: { dark: "#191c1e", light: "#ffffff" },
});
setQrDataUrl(qr);
await document.fonts.ready;
await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const dataUrl = await toPng(cardRef.current!, {
  cacheBust: true,
  pixelRatio: SHARE_CARD_PIXEL_RATIO,
  width: SHARE_CARD_LOGICAL_WIDTH,
  height: layout.logicalHeight,
});
downloadDataUrl(buildShareImageFileName(trip.title), dataUrl);
```

系统分享使用同一数据 URL：

```ts
const fileName = buildShareImageFileName(trip.title);
const file = await dataUrlToFile(dataUrl, fileName);
if (navigator.canShare?.({ files: [file] })) {
  await navigator.share({ files: [file], title: trip.title });
} else {
  downloadDataUrl(fileName, dataUrl);
}
```

若 `navigator.canShare` 不存在或文件分享不受支持，界面只显示下载按钮。

- [ ] **Step 5：实现弹层与关闭确认**

弹层使用 portal、`role="dialog"`、Escape 关闭和滚动容器。移动端贴近底部但为底部导航预留安全区，桌面端居中。关闭分享前显示确认状态，调用 `DELETE` 成功后清空 URL 与二维码。

- [ ] **Step 6：接入行程详情页**

在 `app/trips/[tripId]/page.tsx`：

```ts
import { TripShareButton } from "@/components/trips/trip-share-button";
import { toPublicTripShareData } from "@/lib/trips/share-view";
```

在查询完成后创建：

```ts
const publicTrip = toPublicTripShareData(trip);
```

标题区右侧操作容器同时放置：

```tsx
<TripShareButton trip={publicTrip} tripId={trip.id} />
```

分享按钮使用 lucide `Share2` 图标，按钮可访问名称为“分享行程”。不移动监控和删除操作。

- [ ] **Step 7：运行组件与类型测试**

Run: `npm test -- tests/unit/trip-share-components.test.tsx tests/unit/ui-components.test.tsx`

Expected: PASS。

Run: `npm run lint`

Expected: TypeScript exits 0。

- [ ] **Step 8：提交详情页分享流程**

```bash
git add src/components/trips/trip-share-button.tsx app/trips/[tripId]/page.tsx tests/unit/trip-share-components.test.tsx tests/unit/ui-components.test.tsx
git commit -m "feat: add trip share controls"
```

### Task 8：增加端到端验证并完成交付检查

**Files:**
- Create: `tests/e2e/trip-sharing.spec.ts`
- Modify: `README.md`
- Modify: `README.en.md`

- [x] **Step 1：写端到端测试**

测试种子创建一个用户和完整行程。浏览器登录后进入详情页：

```ts
await page.goto(`/trips/${trip.id}`);
await page.getByRole("button", { name: "分享行程" }).click();
await page.getByRole("button", { name: "复制公开链接" }).click();
const share = await prisma.tripShare.findUniqueOrThrow({
  where: { tripId: trip.id },
});

const publicPage = await browser.newPage();
await publicPage.goto(`/share/${share.token}`);
await expect(publicPage.getByRole("heading", { name: trip.title })).toBeVisible();
await expect(publicPage.getByText("公开只读")).toBeVisible();
await expect(publicPage.getByText("取消监控")).toHaveCount(0);

await page.getByRole("button", { name: "关闭分享" }).click();
await page.getByRole("button", { name: "确认关闭" }).click();
await publicPage.reload();
await expect(
  publicPage.getByRole("heading", { name: "分享链接无效或已关闭" })
).toBeVisible();
```

对分享卡根节点进行截图并读取尺寸，断言宽高比位于 `1` 到 `16/9` 之间，且二维码 footer 内左侧文本节点排在二维码节点之前。

- [x] **Step 2：运行 E2E 并确认通过**

Run: `npm run test:e2e -- tests/e2e/trip-sharing.spec.ts --reporter=line --workers=1`

Expected: PASS。

- [x] **Step 3：更新 README**

在功能列表增加公开只读链接、可撤销分享和带二维码 PNG；在测试命令区域增加 `trip-sharing.spec.ts` 的运行示例。中英文 README 内容保持对应。

- [x] **Step 4：运行完整验证**

Run: `npm test`

Expected: 所有 Vitest 测试通过。

Run: `npm run lint`

Expected: TypeScript exits 0。

Run: `npm run build`

Expected: Next.js production build succeeds。

Run: `npm run test:e2e -- tests/e2e/trip-sharing.spec.ts --reporter=line --workers=1`

Expected: 分享 E2E 通过。

完成记录（北京时间 2026-07-20）：分享专项 25/25、全量 Vitest 409/409、TypeScript、生产构建和桌面/Pixel 7 E2E 2/2 均通过。RUS-033 调度器鉴权用例已显式配置测试密钥，确保无凭证请求稳定返回 401，同时保留本地未配置密钥时允许 tick 的既有开发行为。

- [x] **Step 5：人工视觉检查**

启动开发服务器，在 `390x844`、`768x1024` 和 `1440x1000` 视口检查：

- 分享弹层不被底部导航遮挡。
- 分享卡正文区域为方形，二维码栏独立增加高度，整图最长不超过 9:16。
- 底部二维码栏只采用左侧品牌提示、右侧二维码的布局。
- 其余颜色、字体和组件风格与 AI Commute 当前页面一致。
- 二维码四周有完整白色静区，缩放后仍清晰。

- [x] **Step 6：提交 E2E 和文档**

```bash
git add tests/e2e/trip-sharing.spec.ts README.md README.en.md
git commit -m "test: cover trip sharing flow"
```

## 最终完成标准

- 行程所有者可以创建、重复复制并关闭一个公开只读链接。
- 未登录访问者只能看到明确允许公开的行程字段。
- 关闭分享或删除行程后，原链接立即失效。
- PNG 宽度为 1080px，正文区域为 1:1，二维码栏额外增加高度，最高不超过 1080x1920。
- PNG 底部左侧为 AI Commute 品牌与扫码提示，右侧为真实二维码。
- 参考图片的整体视觉没有进入实现。
- 单元、集成、类型检查、构建和分享 E2E 全部通过。
