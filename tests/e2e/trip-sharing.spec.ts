import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { prisma as PrismaInstance } from "../../src/lib/db";
import { createPlannedTrip } from "../../src/lib/trips/create-trip";
import { ensureTestDatabase } from "../integration/test-db";

process.env.DATABASE_URL ??= "file:./e2e-test.db";

const email = "trip-sharing-e2e@example.com";
const password = "password";
let prisma: typeof PrismaInstance;
let userId: string;
let tripId: string;
let tripTitle: string;

test.beforeAll(async () => {
  const [{ hashPassword }, db] = await Promise.all([
    import("../../src/lib/auth/password"),
    import("../../src/lib/db"),
  ]);
  prisma = db.prisma;
  await ensureTestDatabase();

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Trip Sharing E2E User",
      passwordHash: await hashPassword(password),
    },
    update: {
      name: "Trip Sharing E2E User",
      passwordHash: await hashPassword(password),
    },
  });
  userId = user.id;
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.trip.deleteMany({ where: { userId } });

  const targetArriveAt = new Date("2026-07-20T10:50:00.000Z");
  const trip = await createPlannedTrip({
    userId,
    rawPrompt: "今晚到城市美术馆",
    timezone: "Asia/Shanghai",
    title: "今晚到城市美术馆",
    finalStopName: "城市美术馆",
    targetArriveAt,
    stops: [
      {
        order: 0,
        name: "演示小区北门",
        lngLat: "121.1,29.1",
        kind: "origin",
      },
      {
        order: 1,
        name: "城市美术馆",
        lngLat: "121.2,29.2",
        kind: "destination",
        targetArriveAt,
      },
    ],
    legs: [
      {
        order: 0,
        originName: "演示小区北门",
        originLngLat: "121.1,29.1",
        destinationName: "城市美术馆",
        destinationLngLat: "121.2,29.2",
        targetArriveAt,
        latestDepartAt: new Date("2026-07-20T10:05:00.000Z"),
        routeMinutes: 37,
        bufferMinutes: 8,
        totalMinutes: 45,
        routeTitle: "地铁优先",
        routeRationale: "按时到达",
        segmentTitle: "乘坐地铁 4 号线",
        segmentDetail: "乘坐 7 站后步行到达",
      },
    ],
  });
  tripId = trip.id;
  tripTitle = trip.title;
});

test.afterAll(async () => {
  await prisma?.$disconnect();
});

test("creates, exports, opens, and revokes a public trip share", async ({
  browser,
  page,
}) => {
  await login(page);
  await page.goto(`/trips/${tripId}`);
  await page.getByRole("button", { name: "分享行程" }).click();
  const dialog = page.getByRole("dialog", { name: "分享行程" });
  await expect(dialog).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "生成分享图" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const png = readFileSync(downloadPath!);
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(width).toBe(1080);
  expect(height).toBeGreaterThanOrEqual(1080);
  expect(height).toBeLessThanOrEqual(1920);

  const layout = await page.locator('[data-share-card="true"]').evaluate((card) => {
    const footer = card.querySelector<HTMLElement>(
      '[data-share-qr-footer="true"]'
    );
    const qr = card.querySelector<HTMLElement>('[data-share-qr="true"]');
    const brand = footer?.querySelector<HTMLElement>("p");
    if (!footer || !qr || !brand) throw new Error("share footer is incomplete");
    const cardBox = card.getBoundingClientRect();
    const footerBox = footer.getBoundingClientRect();
    const qrBox = qr.getBoundingClientRect();
    const brandBox = brand.getBoundingClientRect();
    return {
      cardWidth: cardBox.width,
      cardHeight: cardBox.height,
      footerBottom: footerBox.bottom,
      cardBottom: cardBox.bottom,
      brandLeft: brandBox.left,
      qrLeft: qrBox.left,
    };
  });
  expect(layout.cardWidth).toBe(540);
  expect(layout.cardHeight).toBeGreaterThanOrEqual(540);
  expect(layout.cardHeight).toBeLessThanOrEqual(960);
  expect(Math.abs(layout.footerBottom - layout.cardBottom)).toBeLessThan(1);
  expect(layout.brandLeft).toBeLessThan(layout.qrLeft);

  const share = await prisma.tripShare.findUniqueOrThrow({
    where: { tripId },
  });
  const origin = new URL(page.url()).origin;
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(`${origin}/share/${share.token}`);
  await expect(
    publicPage.getByRole("heading", { name: tripTitle })
  ).toBeVisible();
  await expect(publicPage.getByText("公开只读")).toBeVisible();
  await expect(publicPage.getByText("智能体对话")).toHaveCount(0);
  await expect(publicPage.getByText("取消监控")).toHaveCount(0);

  await dialog
    .getByRole("button", { name: "关闭分享", exact: true })
    .click();
  await dialog.getByRole("button", { name: "确认关闭" }).click();
  await expect(dialog.getByText("分享已关闭")).toBeVisible();

  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", { name: "分享链接无效或已关闭" })
  ).toBeVisible();
  await publicContext.close();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL("/");
}
