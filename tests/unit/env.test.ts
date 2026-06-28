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

  it("provides local defaults for city, timezone, and origin", () => {
    const env = readEnv({});

    expect(env.defaultCity).toBe("宁波");
    expect(env.defaultTimezone).toBe("Asia/Shanghai");
    expect(env.defaultOrigin).toBe("121.5230315924,29.8652491273");
    expect(env.defaultOriginName).toBe("家");
  });
});
