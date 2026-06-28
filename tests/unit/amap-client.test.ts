import { describe, expect, it, vi } from "vitest";
import {
  createAmapClient,
  createMockAmapClient,
  createRealAmapClient,
  type AmapClient,
  type WeatherReference
} from "@/lib/amap";

describe("createMockAmapClient", () => {
  it("returns deterministic POI data with detail traceability", async () => {
    const client = createMockAmapClient();

    const pois = await client.searchPoi({
      keywords: "Longhu Tianjie",
      city: "Ningbo"
    });

    expect(pois).toHaveLength(1);
    expect(pois[0]).toMatchObject({
      id: "mock-longhu-tianjie",
      name: expect.stringContaining("Longhu Tianjie"),
      address: expect.any(String),
      lngLat: expect.stringMatching(/^\d+\.\d+,\d+\.\d+$/)
    });

    const detail = await client.getPoiDetail({ id: pois[0].id });
    expect(detail).toMatchObject({
      id: pois[0].id,
      name: pois[0].name,
      address: pois[0].address,
      lngLat: pois[0].lngLat
    });
    expect(detail.raw).toEqual(expect.objectContaining({ source: "mock" }));
  });

  it("returns weather as reference-only information", async () => {
    const client = createMockAmapClient();

    const weather = await client.getWeather({ city: "Ningbo" });

    const reference: WeatherReference = weather;
    expect(reference.kind).toBe("reference");
    expect(reference.city).toBe("Ningbo");
    expect(reference.summary).toContain("Ningbo");
  });

  it("returns deterministic positive route durations for each commute mode", async () => {
    const client = createMockAmapClient();
    const routeRequest = {
      origin: "121.5230315924,29.8652491273",
      destination: "121.616,29.868",
      city: "Ningbo",
      cityd: "Ningbo"
    };

    const transit = await client.getTransitRoute(routeRequest);
    const walking = await client.getWalkingRoute(routeRequest);
    const bicycling = await client.getBicyclingRoute(routeRequest);

    expect(transit.durationMinutes).toBeGreaterThan(0);
    expect(walking.durationMinutes).toBeGreaterThan(0);
    expect(bicycling.durationMinutes).toBeGreaterThan(0);
    expect([transit.mode, walking.mode, bicycling.mode]).toEqual([
      "transit",
      "walking",
      "bicycling"
    ]);
    expect(transit.raw).toEqual(expect.objectContaining({ source: "mock" }));
  });
});

describe("createAmapClient", () => {
  it("uses the mock client when no AMap key is configured", async () => {
    const client = createAmapClient({});

    const weather = await client.getWeather({ city: "Ningbo" });

    expect(weather).toMatchObject({
      kind: "reference",
      city: "Ningbo"
    });
  });

  it("falls back to mock data when a real client method fails", async () => {
    const realClient: AmapClient = {
      searchPoi: vi.fn(async () => {
        throw new Error("network down");
      }),
      getPoiDetail: vi.fn(async () => {
        throw new Error("network down");
      }),
      getWeather: vi.fn(async () => {
        throw new Error("network down");
      }),
      getTransitRoute: vi.fn(async () => {
        throw new Error("network down");
      }),
      getWalkingRoute: vi.fn(async () => {
        throw new Error("network down");
      }),
      getBicyclingRoute: vi.fn(async () => {
        throw new Error("network down");
      })
    };

    const client = createAmapClient(
      { AMAP_API_KEY: "test-key" },
      { realClient }
    );

    const pois = await client.searchPoi({
      keywords: "Longhu Tianjie",
      city: "Ningbo"
    });
    const weather = await client.getWeather({ city: "Ningbo" });

    expect(pois[0].name).toContain("Longhu Tianjie");
    expect(weather.kind).toBe("reference");
    expect(realClient.searchPoi).toHaveBeenCalledTimes(1);
  });
});

describe("createRealAmapClient", () => {
  it("passes transit cityd, converts duration, and keeps raw route data", async () => {
    const requests: string[] = [];
    const client = createRealAmapClient({
      apiKey: "test-key",
      throttle: { schedule: (job) => job() },
      fetchImpl: vi.fn(async (url: string) => {
        requests.push(url);
        return new Response(
          JSON.stringify({
            status: "1",
            route: { transits: [{ duration: "125" }] }
          })
        );
      }) as typeof fetch
    });

    const route = await client.getTransitRoute({
      origin: "121.1,29.1",
      destination: "121.2,29.2",
      city: "Ningbo",
      cityd: "Hangzhou"
    });

    expect(route.durationMinutes).toBe(3);
    expect(route.raw).toEqual(
      expect.objectContaining({
        route: { transits: [{ duration: "125" }] }
      })
    );
    expect(new URL(requests[0]).searchParams.get("cityd")).toBe("Hangzhou");
  });

  it("throws on AMap status failures", async () => {
    const client = createRealAmapClient({
      apiKey: "test-key",
      throttle: { schedule: (job) => job() },
      fetchImpl: vi.fn(async () =>
        new Response(JSON.stringify({ status: "0", info: "INVALID_USER_KEY" }))
      ) as typeof fetch
    });

    await expect(
      client.searchPoi({ keywords: "Longhu Tianjie", city: "Ningbo" })
    ).rejects.toThrow("AMap status failure");
  });

  it("parses v4 bicycling responses", async () => {
    const client = createRealAmapClient({
      apiKey: "test-key",
      throttle: { schedule: (job) => job() },
      fetchImpl: vi.fn(async () =>
        new Response(
          JSON.stringify({
            errcode: 0,
            data: { paths: [{ duration: 601, distance: 3200 }] }
          })
        )
      ) as typeof fetch
    });

    const route = await client.getBicyclingRoute({
      origin: "121.1,29.1",
      destination: "121.2,29.2"
    });

    expect(route.durationMinutes).toBe(11);
    expect(route.raw).toEqual(
      expect.objectContaining({
        data: { paths: [{ duration: 601, distance: 3200 }] }
      })
    );
  });
});
