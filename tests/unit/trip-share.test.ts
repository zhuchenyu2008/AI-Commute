import { describe, expect, it } from "vitest";
import { createTripShareToken } from "@/lib/trips/share-service";
import { toPublicTripShareData } from "@/lib/trips/share-view";

describe("trip sharing domain", () => {
  it("creates an opaque 192-bit Base64URL token", () => {
    const token = createTripShareToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(createTripShareToken()).not.toBe(token);
  });

  it("projects only public trip fields", () => {
    const source = {
      title: "今晚到城市美术馆",
      timezone: "Asia/Shanghai",
      targetArriveAt: new Date("2026-07-20T10:50:00.000Z"),
      finalStopName: "城市美术馆",
      rawPrompt: "private prompt",
      stops: [
        {
          order: 0,
          name: "演示小区北门",
          lngLat: "121,29",
          notes: "private note",
        },
        {
          order: 1,
          name: "城市美术馆",
          lngLat: "122,30",
          notes: null,
        },
      ],
      legs: [
        {
          order: 0,
          originName: "演示小区北门",
          destinationName: "城市美术馆",
          latestDepartAt: new Date("2026-07-20T10:05:00.000Z"),
          targetArriveAt: new Date("2026-07-20T10:50:00.000Z"),
          selectedCandidate: {
            title: "地铁优先",
            mode: "transit",
            routeMinutes: 37,
            bufferMinutes: 8,
            selected: true,
          },
          routeCandidates: [],
          routeSegments: [
            {
              order: 0,
              mode: "walk",
              title: "步行到地铁站",
              detail: "6 分钟",
              minutes: 6,
              rawJson: "private raw response",
            },
          ],
        },
      ],
    };

    const result = toPublicTripShareData(source);
    const json = JSON.stringify(result);

    expect(result.totalMinutes).toBe(45);
    expect(result.stops.map((stop) => stop.name)).toEqual([
      "演示小区北门",
      "城市美术馆",
    ]);
    expect(json).not.toContain("private prompt");
    expect(json).not.toContain("121,29");
    expect(json).not.toContain("private note");
    expect(json).not.toContain("private raw response");
  });
});
