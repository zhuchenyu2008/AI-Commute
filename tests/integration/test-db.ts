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
      const migration = readFileSync(migrationPath, "utf8");
      for (const statement of splitSqlStatements(migration)) {
        await prisma.$executeRawUnsafe(statement);
      }
    }
  }

  ensured = true;
}
