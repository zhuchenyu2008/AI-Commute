import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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

    expect(packageJson).toContain('"telegram:poll": "tsx scripts/telegram-poll.ts"');
    expect(compose).toContain("telegram:");
    expect(compose).toContain("npm run telegram:poll");
    expect(compose).toContain("depends_on:");
    expect(compose).toContain("- web");
    expect(readme).toContain("TELEGRAM_BOT_TOKEN");
    expect(readme).toContain("npm run telegram:poll");
    expect(readme).toContain("/trips");
    expect(readme).toContain("/cancel");
  });
});
