// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicTripShareData } from "@/lib/trips/share-types";

const getPublicTripShareByTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/trips/share-service", () => ({
  getPublicTripShareByToken: getPublicTripShareByTokenMock,
}));

const sampleTrip: PublicTripShareData = {
  title: "今晚到城市美术馆",
  timezone: "Asia/Shanghai",
  targetArriveAt: "2026-07-20T10:50:00.000Z",
  finalStopName: "城市美术馆",
  totalRouteMinutes: 37,
  totalBufferMinutes: 8,
  totalMinutes: 45,
  stops: [{ name: "演示小区北门" }, { name: "城市美术馆" }],
  legs: [
    {
      originName: "演示小区北门",
      destinationName: "城市美术馆",
      latestDepartAt: "2026-07-20T10:05:00.000Z",
      targetArriveAt: "2026-07-20T10:50:00.000Z",
      routeTitle: "地铁优先",
      routeMode: "transit",
      routeMinutes: 37,
      bufferMinutes: 8,
      segments: [
        {
          mode: "walk",
          title: "步行到地铁站",
          detail: "从北门出发",
          minutes: 6,
        },
        {
          mode: "metro",
          title: "乘坐地铁 4 号线",
          detail: "乘坐 7 站",
          minutes: 31,
        },
      ],
    },
  ],
};

describe("trip share views", () => {
  beforeEach(() => {
    getPublicTripShareByTokenMock.mockReset();
  });

  it("renders public trip details without private management actions", async () => {
    const { PublicTripShare } = await import(
      "@/components/trips/public-trip-share"
    );
    const html = renderToStaticMarkup(<PublicTripShare trip={sampleTrip} />);

    expect(html).toContain("公开只读");
    expect(html).toContain("今晚到城市美术馆");
    expect(html).toContain("步行到地铁站");
    expect(html).toContain("45 分钟");
    expect(html).not.toContain("取消监控");
    expect(html).not.toContain("智能体对话");
    expect(html).not.toContain("删除行程");
  });

  it("renders a valid no-login share route with noindex metadata", async () => {
    getPublicTripShareByTokenMock.mockResolvedValue(sampleTrip);
    const pageModule = await import("@app/share/[token]/page");
    const view = await pageModule.default({
      params: Promise.resolve({ token: "public-token" }),
    });
    const html = renderToStaticMarkup(view);

    expect(getPublicTripShareByTokenMock).toHaveBeenCalledWith("public-token");
    expect(html).toContain("今晚到城市美术馆");
    expect(pageModule.dynamic).toBe("force-dynamic");
    expect(pageModule.metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("uses one neutral unavailable page for invalid or revoked tokens", async () => {
    getPublicTripShareByTokenMock.mockResolvedValue(null);
    const pageModule = await import("@app/share/[token]/page");
    const view = await pageModule.default({
      params: Promise.resolve({ token: "revoked-token" }),
    });
    const html = renderToStaticMarkup(view);

    expect(html).toContain("分享链接无效或已关闭");
    expect(html).not.toContain("revoked-token");
  });
});

export { sampleTrip };
