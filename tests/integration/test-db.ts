import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

async function executeMigration(migrationPath: string) {
  const migration = readFileSync(migrationPath, "utf8");
  for (const statement of splitSqlStatements(migration)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function ensureOptionalOriginMigration() {
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

  const existing = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'User'"
  );

  if (existing.length === 0) {
    for (const migrationPath of readMigrationFiles()) {
      await executeMigration(migrationPath);
    }
  } else {
    await ensureOptionalOriginMigration();
  }

  ensured = true;
}
