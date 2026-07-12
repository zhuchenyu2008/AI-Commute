// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HistoryPage from "@app/history/page";
import TripDetailPage from "@app/trips/[tripId]/page";

const {
  getCurrentUserMock,
  prismaTripFindFirstMock,
  prismaTripFindManyMock,
  routerPushMock,
  routerRefreshMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  prismaTripFindFirstMock: vi.fn(),
  prismaTripFindManyMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerRefreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  usePathname: () => "/history",
  useRouter: () => ({
    push: routerPushMock,
    refresh: routerRefreshMock,
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    trip: {
      findFirst: prismaTripFindFirstMock,
      findMany: prismaTripFindManyMock,
    },
  },
}));

const tripId = "trip-1";
const arriveAt = new Date("2026-07-02T01:00:00.000Z");
const createdAt = new Date("2026-07-01T16:05:00.000Z");

function makeHistoryTrip() {
  return {
    id: tripId,
    title: "July 2 selected trip",
    status: "completed",
    targetArriveAt: arriveAt,
    timezone: "Asia/Shanghai",
    createdAt,
    finalStopName: "Office",
    legs: [
      {
        selectedCandidate: {
          routeMinutes: 20,
          totalMinutes: 30,
        },
      },
    ],
  };
}

function makeTripDetail() {
  return {
    ...makeHistoryTrip(),
    updatedAt: createdAt,
    agentSessionId: null,
    agentSessions: [],
    recalculations: [],
    reminderJobs: [],
    stops: [
      {
        id: "origin-stop",
        name: "Home",
        order: 0,
      },
      {
        id: "destination-stop",
        name: "Office",
        order: 1,
      },
    ],
    legs: [
      {
        id: "leg-1",
        originName: "Home",
        destinationName: "Office",
        latestDepartAt: new Date("2026-07-02T00:30:00.000Z"),
        targetArriveAt: arriveAt,
        selectedCandidate: {
          title: "Transit route",
          routeMinutes: 20,
          bufferMinutes: 10,
          totalMinutes: 30,
        },
        routeCandidates: [],
        routeSegments: [
          {
            id: "segment-1",
            mode: "transit",
            title: "Line 1",
            detail: "4 stops",
            minutes: 20,
          },
        ],
        bufferComponents: [
          {
            id: "buffer-1",
            category: "safety",
            label: "Buffer",
            minutes: 10,
            reason: "Leave a little slack.",
            source: "test",
          },
        ],
        reminderJobs: [],
        recalculations: [],
      },
    ],
  };
}

describe("history detail navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    getCurrentUserMock.mockReset();
    prismaTripFindFirstMock.mockReset();
    prismaTripFindManyMock.mockReset();
    routerPushMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it("carries the selected history day into trip detail links", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    prismaTripFindManyMock.mockResolvedValue([makeHistoryTrip()]);

    const html = renderToStaticMarkup(
      await HistoryPage({
        searchParams: Promise.resolve({ date: "2026-07-02" }),
      })
    );

    expect(html).toContain('href="/trips/trip-1?historyDate=2026-07-02"');
  });

  it("returns from trip detail to the originally selected history day", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    prismaTripFindFirstMock.mockResolvedValue(makeTripDetail());

    const detailProps = {
      params: Promise.resolve({ tripId }),
      searchParams: Promise.resolve({ historyDate: "2026-07-02" }),
    } as Parameters<typeof TripDetailPage>[0] & {
      searchParams: Promise<{ historyDate: string }>;
    };

    const html = renderToStaticMarkup(await TripDetailPage(detailProps));

    expect(html).toContain('href="/history?date=2026-07-02"');
  });

  it("does not duplicate the origin in the trip detail map reference", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    prismaTripFindFirstMock.mockResolvedValue(makeTripDetail());

    const detailProps = {
      params: Promise.resolve({ tripId }),
      searchParams: Promise.resolve({}),
    } as Parameters<typeof TripDetailPage>[0];

    const html = renderToStaticMarkup(await TripDetailPage(detailProps));

    expect(html).toContain("Home -&gt; Office");
    expect(html).not.toContain("Home -&gt; Home -&gt; Office");
  });
});
