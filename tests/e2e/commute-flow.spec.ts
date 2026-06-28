import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { prisma as PrismaInstance } from "../../src/lib/db";

const email = "user@example.com";
const password = "password";
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
          originName: env.defaultOriginName,
          originLngLat: env.defaultOrigin,
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
            originName: env.defaultOriginName,
            originLngLat: env.defaultOrigin,
          },
          update: {
            defaultCity: env.defaultCity,
            timezone: env.defaultTimezone,
            originName: env.defaultOriginName,
            originLngLat: env.defaultOrigin,
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
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL("/");
  await page
    .getByLabel("Search destination")
    .fill("tomorrow 9:15 to Longhu Tianjie cinema");
  await page.getByRole("button", { name: "Plan" }).click();

  await expect(page).toHaveURL(/\/agent\//);
  await expect(page.getByText("Planning your commute")).toBeVisible();
  await expect(page.getByText("Agent session")).toBeVisible();

  await page.waitForURL(/\/trips\//, { timeout: 60_000 });
  await expect(
    page.getByRole("heading", { name: "Route segments" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reminders" })).toBeVisible();

  const conversationLink = page.getByRole("link", {
    name: "Agent conversation",
  });
  await expect(conversationLink).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/agent\/.+view=conversation/, { timeout: 10_000 }),
    conversationLink.click({ timeout: 5_000 }),
  ]);
  await expect(page.getByText("Planning your commute")).toBeVisible();
  expect(page.url()).not.toContain("/trips/");
});
