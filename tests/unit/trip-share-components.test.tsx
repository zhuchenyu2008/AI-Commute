// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getShareCardLayout } from "@/lib/trips/share-image";
import type { PublicTripShareData } from "@/lib/trips/share-types";

const getPublicTripShareByTokenMock = vi.hoisted(() => vi.fn());
const qrToDataUrlMock = vi.hoisted(() => vi.fn());
const toPngMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/trips/share-service", () => ({
  getPublicTripShareByToken: getPublicTripShareByTokenMock,
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: qrToDataUrlMock },
}));

vi.mock("html-to-image", () => ({
  toPng: toPngMock,
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
    qrToDataUrlMock.mockReset();
    toPngMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it("renders a bottom qr footer with brand text on the left", async () => {
    const { TripShareCard } = await import(
      "@/components/trips/trip-share-card"
    );
    const html = renderToStaticMarkup(
      <TripShareCard
        layout={getShareCardLayout(sampleTrip.legs[0].segments.length)}
        qrDataUrl="data:image/png;base64,qr"
        trip={sampleTrip}
      />
    );
    const footerIndex = html.indexOf('data-share-qr-footer="true"');
    const brandIndex = html.indexOf("AI Commute", footerIndex);
    const hintIndex = html.indexOf("扫码查看完整行程", footerIndex);
    const qrIndex = html.indexOf('data-share-qr="true"', footerIndex);

    expect(footerIndex).toBeGreaterThan(-1);
    expect(brandIndex).toBeGreaterThan(footerIndex);
    expect(hintIndex).toBeGreaterThan(brandIndex);
    expect(qrIndex).toBeGreaterThan(hintIndex);
    expect(html).toContain("width:540px");
    expect(html).toContain("height:540px");
    expect(html).not.toContain("gradient");
  });

  it("creates and copies a public link from the share dialog", async () => {
    const writeTextMock = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return Response.json({
            enabled: true,
            url: "http://localhost:3000/share/public-token",
          });
        }
        return Response.json({ enabled: false, url: null });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    const { TripShareButton } = await import(
      "@/components/trips/trip-share-button"
    );

    render(<TripShareButton trip={sampleTrip} tripId="trip-1" />);
    fireEvent.click(screen.getByRole("button", { name: "分享行程" }));
    const dialog = await screen.findByRole("dialog", { name: "分享行程" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "复制公开链接" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/trips/trip-1/share", {
        method: "POST",
      });
      expect(writeTextMock).toHaveBeenCalledWith(
        "http://localhost:3000/share/public-token"
      );
    });
    expect(within(dialog).getByText("链接已复制")).toBeTruthy();
  });

  it("generates a 1080px share PNG with the public-link QR code", async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return Response.json({
            enabled: true,
            url: "http://localhost:3000/share/public-token",
          });
        }
        return Response.json({ enabled: false, url: null });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    qrToDataUrlMock.mockResolvedValue("data:image/png;base64,qr");
    toPngMock.mockResolvedValue("data:image/png;base64,share");
    const anchorClickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const { TripShareButton } = await import(
      "@/components/trips/trip-share-button"
    );

    render(<TripShareButton trip={sampleTrip} tripId="trip-1" />);
    fireEvent.click(screen.getByRole("button", { name: "分享行程" }));
    const dialog = await screen.findByRole("dialog", { name: "分享行程" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "生成分享图" })
    );

    await waitFor(() => {
      expect(qrToDataUrlMock).toHaveBeenCalledWith(
        "http://localhost:3000/share/public-token",
        expect.objectContaining({ margin: 4, width: 192 })
      );
      expect(toPngMock).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          pixelRatio: 2,
          width: 540,
          height: 540,
        })
      );
      expect(
        (toPngMock.mock.calls[0]?.[0] as HTMLElement).dataset.shareCard
      ).toBe("true");
      expect(anchorClickMock).toHaveBeenCalled();
    });
  });

  it("confirms before closing an active share", async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          return Response.json({ enabled: false, url: null });
        }
        return Response.json({
          enabled: true,
          url: "http://localhost:3000/share/public-token",
        });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    const { TripShareButton } = await import(
      "@/components/trips/trip-share-button"
    );

    render(<TripShareButton trip={sampleTrip} tripId="trip-1" />);
    fireEvent.click(screen.getByRole("button", { name: "分享行程" }));
    const dialog = await screen.findByRole("dialog", { name: "分享行程" });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "关闭分享" })
      ).toBeTruthy()
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "关闭分享" })
    );
    expect(
      within(dialog).getByRole("button", { name: "确认关闭" })
    ).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "确认关闭" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/trips/trip-1/share", {
        method: "DELETE",
      });
    });
    expect(within(dialog).getByText("分享已关闭")).toBeTruthy();
  });

  it("mounts the share action in the trip detail header", () => {
    const source = readFileSync(
      join(process.cwd(), "app/trips/[tripId]/page.tsx"),
      "utf8"
    );

    expect(source).toContain(
      'import { TripShareButton } from "@/components/trips/trip-share-button";'
    );
    expect(source).toContain("const publicTrip = toPublicTripShareData(trip);");
    expect(source).toContain(
      "<TripShareButton trip={publicTrip} tripId={trip.id} />"
    );
  });
});

export { sampleTrip };
