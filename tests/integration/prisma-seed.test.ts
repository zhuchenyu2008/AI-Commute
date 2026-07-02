import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { verifyPassword } from "@/lib/auth/password";

const originalEnv = { ...process.env };
const createdFiles: string[] = [];

function splitSqlStatements(sql: string) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applyMigrations(prisma: PrismaClient) {
  const migrationsDir = "prisma/migrations";
  const migrations = readdirSync(migrationsDir)
    .filter((name) => statSync(join(migrationsDir, name)).isDirectory())
    .sort();

  for (const migration of migrations) {
    const sql = readFileSync(join(migrationsDir, migration, "migration.sql"), "utf8");
    for (const statement of splitSqlStatements(sql)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}

function runSeedCommand(env: NodeJS.ProcessEnv) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm.cmd", "run", "prisma:seed"]
      : ["run", "prisma:seed"];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Seed command exited with ${result.status}`,
        result.signal ? `Signal: ${result.signal}` : "",
        result.error ? `Error: ${result.error.message}` : "",
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
}

describe("Prisma seed", () => {
  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);

    for (const file of createdFiles.splice(0)) {
      const fullPath = resolve(file);
      if (!fullPath.startsWith(process.cwd())) {
        throw new Error(`Refusing to remove outside workspace: ${fullPath}`);
      }
      rmSync(fullPath, { force: true });
    }
  });

  it("creates a login user after migrations have prepared an empty database", async () => {
    const databaseName = `seed-verify-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.db`;
    const databasePath = join("prisma", databaseName);
    const databaseUrl = `file:./${databaseName}`;
    createdFiles.push(
      databasePath,
      `${databasePath}-journal`,
      `${databasePath}-wal`,
      `${databasePath}-shm`
    );

    process.env.DATABASE_URL = databaseUrl;
    process.env.DEFAULT_CITY = "宁波";
    process.env.DEFAULT_TIMEZONE = "Asia/Shanghai";
    process.env.SEED_USER_EMAIL = "docker-seed@example.com";
    process.env.SEED_USER_PASSWORD = "docker-seed-password";

    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      await applyMigrations(prisma);
      expect(await prisma.user.count()).toBe(0);

      runSeedCommand({
        ...process.env,
        DATABASE_URL: databaseUrl,
        DEFAULT_CITY: "宁波",
        DEFAULT_TIMEZONE: "Asia/Shanghai",
        SEED_USER_EMAIL: "docker-seed@example.com",
        SEED_USER_PASSWORD: "docker-seed-password",
      });

      const user = await prisma.user.findUnique({
        where: { email: "docker-seed@example.com" },
        include: { settings: true },
      });

      expect(user).not.toBeNull();
      expect(user?.settings).toMatchObject({
        defaultCity: "宁波",
        timezone: "Asia/Shanghai",
        routePreference: "balanced",
      });
      expect(
        await verifyPassword("docker-seed-password", user?.passwordHash ?? "")
      ).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });
});
