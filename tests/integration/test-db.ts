import { readFileSync } from "node:fs";
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

export async function ensureTestDatabase() {
  if (ensured) return;

  const databaseUrl = process.env.DATABASE_URL;
  if (
    !databaseUrl ||
    !databaseUrl.startsWith("file:./") ||
    !/(test|verify)/i.test(databaseUrl)
  ) {
    throw new Error(
      "Integration tests require DATABASE_URL to be an explicit test SQLite file."
    );
  }

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

  ensured = true;
}
