import { describe, expect, it } from "vitest";
import { readEnv } from "@/lib/env";

describe("readEnv", () => {
  it("returns safe defaults without exposing secrets", () => {
    const env = readEnv({
      DATABASE_URL: "file:./test.db",
      AMAP_API_KEY: "secret-amap",
      OPENAI_API_KEY: "secret-openai"
    });

    expect(env.databaseUrl).toBe("file:./test.db");
    expect(env.hasAmapKey).toBe(true);
    expect(env.hasOpenAiKey).toBe(true);
    expect(JSON.stringify(env)).not.toContain("secret-amap");
    expect(JSON.stringify(env)).not.toContain("secret-openai");
  });

  it("provides local defaults for city and timezone", () => {
    const env = readEnv({});

    expect(env.defaultCity).toBe("宁波");
    expect(env.defaultTimezone).toBe("Asia/Shanghai");
  });

  it("does not expose default origin configuration", () => {
    const env = readEnv({
      DATABASE_URL: "file:./unit-test.db",
      DEFAULT_ORIGIN: "121,29",
      DEFAULT_ORIGIN_NAME: "Home",
    });

    expect("defaultOrigin" in env).toBe(false);
    expect("defaultOriginName" in env).toBe(false);
  });
});
