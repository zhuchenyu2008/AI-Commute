import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readComposeServiceBlock(compose: string, serviceName: string) {
  const lines = compose.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${serviceName}:`);

  expect(start).toBeGreaterThanOrEqual(0);

  const end = lines.findIndex((line, index) => index > start && /^  \S/.test(line));

  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

describe("Docker configuration", () => {
  it("defines web and scheduler services with persisted SQLite data", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");

    expect(compose).toContain("web:");
    expect(compose).toContain("scheduler:");
    expect(compose).toContain("./data:/app/data");
    expect(compose).toContain("env_file:");
    expect(compose).toContain("DATABASE_URL: file:/app/data/commute.db");
  });

  it("documents local and docker operation commands", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("# 通勤规划助手");
    expect(readme).toContain("## 本地开发");
    expect(readme).toContain("## Docker");
    expect(readme).toContain("npm run dev");
    expect(readme).toContain("docker compose up --build");
    expect(readme).toContain("npm run scheduler:tick");
  });

  it("defines a Telegram worker service and script", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");
    const packageJson = readFileSync("package.json", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const telegramBlock = readComposeServiceBlock(compose, "telegram");

    expect(packageJson).toContain('"telegram:poll": "tsx scripts/telegram-poll.ts"');
    expect(telegramBlock).toContain('command: sh -c "npx prisma migrate deploy && npm run telegram:poll"');
    expect(telegramBlock).toContain("env_file:");
    expect(telegramBlock).toContain("- .env");
    expect(telegramBlock).toContain("DATABASE_URL: file:/app/data/commute.db");
    expect(telegramBlock).toContain("volumes:");
    expect(telegramBlock).toContain("./data:/app/data");
    expect(telegramBlock).toContain("depends_on:");
    expect(telegramBlock).toContain("- web");
    expect(telegramBlock).toContain("restart: unless-stopped");
    expect(readme).toContain("TELEGRAM_BOT_TOKEN");
    expect(readme).toContain("npm run telegram:poll");
    expect(readme).toContain("/trips");
    expect(readme).toContain("/cancel");
  });
});
