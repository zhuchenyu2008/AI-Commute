import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { prisma as PrismaInstance } from "../../src/lib/db";

const email = "user@example.com";
const password = "password";
const testOriginName = "E2E Origin";
const testOriginLngLat = "121.5230315924,29.8652491273";
process.env.DATABASE_URL ??= "file:./e2e-test.db";

let prisma: typeof PrismaInstance;

function splitSqlStatements(sql: string) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

test.beforeAll(async () => {
  const [{ hashPassword }, db, { readEnv }] = await Promise.all([
    import("../../src/lib/auth/password"),
    import("../../src/lib/db"),
    import("../../src/lib/env"),
  ]);
  prisma = db.prisma;
  const env = readEnv();
  const passwordHash = await hashPassword(password);

  const existing = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'User'"
  );

  if (existing.length === 0) {
    const migration = readFileSync(
      "prisma/migrations/20260628083500_init/migration.sql",
      "utf8"
    );

    for (const statement of splitSqlStatements(migration)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "E2E User",
      passwordHash,
      settings: {
        create: {
          defaultCity: env.defaultCity,
          timezone: env.defaultTimezone,
          originName: testOriginName,
          originLngLat: testOriginLngLat,
        },
      },
    },
    update: {
      passwordHash,
      settings: {
        upsert: {
          create: {
            defaultCity: env.defaultCity,
            timezone: env.defaultTimezone,
            originName: testOriginName,
            originLngLat: testOriginLngLat,
          },
          update: {
            defaultCity: env.defaultCity,
            timezone: env.defaultTimezone,
            originName: testOriginName,
            originLngLat: testOriginLngLat,
          },
        },
      },
    },
  });
});

test.afterAll(async () => {
  await prisma?.$disconnect();
});

test("home prompt opens Agent planning and lands on trip detail", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL("/");
  await page
    .getByLabel("搜索目的地")
    .fill("明天 9:15 到龙湖天街电影院");
  await page.getByRole("button", { name: "规划" }).click();

  await expect(page).toHaveURL(/\/agent\//);
  await expect(page.getByText("正在规划你的通勤")).toBeVisible();
  await expect(page.getByText("智能体会话")).toBeVisible();

  await page.waitForURL(/\/trips\//, { timeout: 60_000 });
  await expect(
    page.getByRole("heading", { name: "路线分段" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "提醒计划" })).toBeVisible();

  const conversationLink = page.getByRole("link", {
    name: "智能体对话",
  });
  await expect(conversationLink).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/agent\/.+view=conversation/, { timeout: 10_000 }),
    conversationLink.click({ timeout: 5_000 }),
  ]);
  await expect(page.getByText("正在规划你的通勤")).toBeVisible();
  expect(page.url()).not.toContain("/trips/");
});
