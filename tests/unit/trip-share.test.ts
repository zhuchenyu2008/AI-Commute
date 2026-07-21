import { describe, expect, it } from "vitest";
import { createTripShareToken } from "@/lib/trips/share-service";
import { toPublicTripShareData } from "@/lib/trips/share-view";
import {
  buildShareImageFileName,
  getShareCardCaptureHeight,
  getShareCardLayout,
  SHARE_CARD_CONTENT_MIN_HEIGHT,
  SHARE_CARD_FOOTER_HEIGHT,
  SHARE_CARD_LOGICAL_WIDTH,
  SHARE_CARD_MAX_HEIGHT,
  SHARE_CARD_MIN_HEIGHT,
  SHARE_CARD_PIXEL_RATIO,
} from "@/lib/trips/share-image";

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
            id: "candidate-selected",
            title: "地铁优先",
            mode: "transit",
            routeMinutes: 37,
            bufferMinutes: 8,
            selected: true,
          },
          routeCandidates: [],
          routeSegments: [
            {
              candidateId: "candidate-selected",
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

  it("projects route segments only from the selected candidate", () => {
    const result = toPublicTripShareData({
      title: "候选路线过滤",
      timezone: "Asia/Shanghai",
      targetArriveAt: null,
      finalStopName: "公司",
      stops: [],
      legs: [
        {
          order: 0,
          originName: "家",
          destinationName: "公司",
          latestDepartAt: null,
          targetArriveAt: null,
          selectedCandidate: null,
          routeCandidates: [
            {
              id: "candidate-backup",
              title: "备用路线",
              mode: "taxi",
              routeMinutes: 20,
              bufferMinutes: 5,
            },
            {
              id: "candidate-selected",
              title: "已选路线",
              mode: "transit",
              routeMinutes: 30,
              bufferMinutes: 8,
              selected: true,
            },
          ],
          routeSegments: [
            {
              candidateId: "candidate-backup",
              order: 0,
              mode: "taxi",
              title: "不应公开的备用路线",
              detail: null,
              minutes: 20,
            },
            {
              candidateId: "candidate-selected",
              order: 0,
              mode: "walk",
              title: "步行到地铁站",
              detail: null,
              minutes: 5,
            },
          ],
        },
      ],
    });

    expect(result.legs[0]?.routeTitle).toBe("已选路线");
    expect(result.legs[0]?.segments).toEqual([
      {
        mode: "walk",
        title: "步行到地铁站",
        detail: null,
        minutes: 5,
      },
    ]);
  });

  it("projects no route details when a leg has no selected candidate", () => {
    const result = toPublicTripShareData({
      title: "尚未选路线",
      timezone: "Asia/Shanghai",
      targetArriveAt: null,
      finalStopName: "公司",
      stops: [],
      legs: [
        {
          order: 0,
          originName: "家",
          destinationName: "公司",
          latestDepartAt: null,
          targetArriveAt: null,
          selectedCandidate: null,
          routeCandidates: [
            {
              id: "candidate-backup",
              title: "未选择路线",
              mode: "taxi",
              routeMinutes: 20,
              bufferMinutes: 5,
            },
          ],
          routeSegments: [
            {
              candidateId: "candidate-backup",
              order: 0,
              mode: "taxi",
              title: "不应公开的未选路线",
              detail: null,
              minutes: 20,
            },
          ],
        },
      ],
    });

    expect(result.legs[0]).toMatchObject({
      routeTitle: null,
      routeMode: null,
      routeMinutes: 0,
      bufferMinutes: 0,
      segments: [],
    });
  });

  it("prefers square output and never exceeds 9:16", () => {
    expect(SHARE_CARD_LOGICAL_WIDTH * SHARE_CARD_PIXEL_RATIO).toBe(1080);
    expect(SHARE_CARD_MAX_HEIGHT * SHARE_CARD_PIXEL_RATIO).toBe(1920);
    expect(SHARE_CARD_CONTENT_MIN_HEIGHT).toBe(540);
    expect(SHARE_CARD_FOOTER_HEIGHT).toBe(108);
    expect(SHARE_CARD_MIN_HEIGHT).toBe(648);
    expect(getShareCardLayout(3)).toEqual({
      logicalHeight: 648,
      visibleSegmentCount: 3,
      hiddenSegmentCount: 0,
    });
    expect(getShareCardLayout(4)).toEqual({
      logicalHeight: 648,
      visibleSegmentCount: 4,
      hiddenSegmentCount: 0,
    });

    const long = getShareCardLayout(30);
    expect(long.logicalHeight).toBeLessThanOrEqual(960);
    expect(long.visibleSegmentCount).toBe(30);
    expect(long.hiddenSegmentCount).toBe(0);
    expect(getShareCardCaptureHeight(648)).toBe(648);
    expect(getShareCardCaptureHeight(1200)).toBe(960);
  });

  it("builds a filesystem-safe Beijing-date PNG name", () => {
    expect(
      buildShareImageFileName(
        "家/公司:晚班",
        new Date("2026-07-20T03:30:00.000Z")
      )
    ).toBe("AI-Commute-家公司晚班-2026-07-20.png");
  });
});
