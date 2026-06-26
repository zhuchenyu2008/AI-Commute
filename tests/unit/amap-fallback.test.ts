import { afterEach, describe, expect, it, vi } from "vitest";

describe("AMap service fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("falls back to deterministic POI and route estimates when configured fetch fails", async () => {
    vi.stubEnv("AMAP_WEB_SERVICE_KEY", "configured-but-unreachable");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    const { AmapService } = await import("@/lib/services/amap");
    const service = new AmapService();

    await expect(service.searchPoi("龙湖天街", "宁波")).resolves.toMatchObject({
      name: "龙湖天街",
      location: expect.any(String)
    });
    await expect(service.transitDuration("121.5230315924,29.8652491273", "121.590364,29.880799", "宁波", "宁波")).resolves.toMatchObject({
      minutes: expect.any(Number)
    });
  });
});
