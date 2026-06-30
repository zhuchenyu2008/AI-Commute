import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { prisma } from "@/lib/db";

let ensured = false;

function splitSqlStatements(sql: string) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function readMigrationFiles() {
  return readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("prisma/migrations", entry.name, "migration.sql"))
    .sort();
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function sqlitePathFromDatabaseUrl(databaseUrl: string) {
  const rawPath = databaseUrl.slice("file:".length).split("?")[0];
  return rawPath.startsWith("./") ? join("prisma", rawPath.slice(2)) : rawPath;
}

async function withDatabaseLock<T>(
  databaseUrl: string,
  action: () => Promise<T>
) {
  const lockPath = `${sqlitePathFromDatabaseUrl(databaseUrl)}.lock`;
  mkdirSync(dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const lock = openSync(lockPath, "wx");
      closeSync(lock);

      try {
        return await action();
      } finally {
        unlinkSync(lockPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }

      await sleep(50);
    }
  }

  throw new Error("Timed out waiting for test database migration lock.");
}

async function executeMigration(migrationPath: string) {
  const migration = readFileSync(migrationPath, "utf8");
  for (const statement of splitSqlStatements(migration)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function sqliteObjectExists(type: "index" | "table", name: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type = '${type}' AND name = '${name}'`
  );
  return rows.length > 0;
}

async function ensureOptionalOriginMigration() {
  // Existing local test DBs may have been created before optional origins.
  // Patch only that known old shape without replaying the init migration.
  const columns = await prisma.$queryRawUnsafe<
    Array<{ name: string; notnull: number }>
  >("PRAGMA table_info('UserSettings')");
  const originColumns = columns.filter((column) =>
    ["originName", "originLngLat"].includes(column.name)
  );
  const hasRequiredOrigin = originColumns.some(
    (column) => Number(column.notnull) === 1
  );

  if (hasRequiredOrigin) {
    await executeMigration(
      "prisma/migrations/20260628193000_optional_origin_settings/migration.sql"
    );
  }
}

async function ensureTelegramMigrations() {
  const hasChatState = await sqliteObjectExists("table", "TelegramChatState");
  const hasBotState = await sqliteObjectExists("table", "TelegramBotState");

  if (!hasChatState && !hasBotState) {
    await executeMigration(
      "prisma/migrations/20260630090000_telegram_agent_entry/migration.sql"
    );
  } else if (!hasChatState || !hasBotState) {
    throw new Error("Test database has a partial Telegram migration.");
  }

  const hasTelegramChatIdIndex = await sqliteObjectExists(
    "index",
    "UserSettings_telegramChatId_key"
  );

  if (!hasTelegramChatIdIndex) {
    await ensureUniqueTelegramChatIds();
    await executeMigration(
      "prisma/migrations/20260630120000_unique_telegram_chat_id/migration.sql"
    );
  }
}

async function ensureUniqueTelegramChatIds() {
  const settings = await prisma.userSettings.findMany({
    where: { telegramChatId: { not: null } },
    orderBy: [{ telegramChatId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, telegramChatId: true },
  });
  const seen = new Set<string>();
  const duplicateIds: string[] = [];

  for (const setting of settings) {
    const chatId = setting.telegramChatId;
    if (!chatId) continue;

    if (seen.has(chatId)) {
      duplicateIds.push(setting.id);
    } else {
      seen.add(chatId);
    }
  }

  if (duplicateIds.length > 0) {
    await prisma.userSettings.updateMany({
      where: { id: { in: duplicateIds } },
      data: { telegramChatId: null },
    });
  }
}

export async function ensureTestDatabase() {
  if (ensured) return;

  const databaseUrl = process.env.DATABASE_URL;
  if (
    !databaseUrl ||
    !databaseUrl.startsWith("file:./") ||
    !/(test|verify|e2e)/i.test(databaseUrl)
  ) {
    throw new Error(
      "Integration tests require DATABASE_URL to be an explicit test SQLite file."
    );
  }

  await withDatabaseLock(databaseUrl, async () => {
    const existing = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'User'"
    );

    if (existing.length === 0) {
      for (const migrationPath of readMigrationFiles()) {
        await executeMigration(migrationPath);
      }
    } else {
      await ensureOptionalOriginMigration();
      await ensureTelegramMigrations();
    }
  });

  ensured = true;
}
