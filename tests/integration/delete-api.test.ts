import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createPlannedTrip } from "@/lib/trips/create-trip";
import { ensureTestDatabase } from "./test-db";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

const getCurrentUserMock = vi.hoisted(() =>
  vi.fn<() => Promise<CurrentUser | null>>()
);

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, getCurrentUser: getCurrentUserMock };
});

describe("web delete APIs", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  beforeEach(() => {
    getCurrentUserMock.mockReset();
  });

  it("deletes an owned trip and cascades related records", async () => {
    const { DELETE } = await import("@app/api/trips/[tripId]/route");
    const user = await prisma.user.create({
      data: {
        email: `delete-trip-${Date.now()}@example.com`,
        name: "Delete Trip User",
        passwordHash: "hash",
      },
      include: { settings: true },
    });
    const trip = await createPlannedTrip({
      userId: user.id,
      rawPrompt: "Delete this trip.",
      timezone: "Asia/Shanghai",
      title: "Home-Office",
      finalStopName: "Office",
      stops: [
        {
          order: 0,
          name: "Home",
          lngLat: "121.1,29.1",
          kind: "origin",
        },
        {
          order: 1,
          name: "Office",
          lngLat: "121.2,29.2",
          kind: "destination",
        },
      ],
      legs: [
        {
          order: 0,
          originName: "Home",
          originLngLat: "121.1,29.1",
          destinationName: "Office",
          destinationLngLat: "121.2,29.2",
          routeMinutes: 25,
          bufferComponents: [
            {
              category: "transfer",
              label: "Transfer",
              minutes: 5,
              reason: "Leave time for transfer.",
            },
          ],
        },
      ],
    });
    getCurrentUserMock.mockResolvedValue(user);

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ tripId: trip.id }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ status: "deleted" });
    await expect(
      prisma.trip.count({ where: { id: trip.id } })
    ).resolves.toBe(0);
    await expect(
      prisma.tripLeg.count({ where: { tripId: trip.id } })
    ).resolves.toBe(0);
    await expect(
      prisma.reminderJob.count({ where: { tripId: trip.id } })
    ).resolves.toBe(0);
  });

  it("does not delete another user's trip", async () => {
    const { DELETE } = await import("@app/api/trips/[tripId]/route");
    const owner = await prisma.user.create({
      data: {
        email: `delete-trip-owner-${Date.now()}@example.com`,
        name: "Delete Trip Owner",
        passwordHash: "hash",
      },
      include: { settings: true },
    });
    const intruder = await prisma.user.create({
      data: {
        email: `delete-trip-intruder-${Date.now()}@example.com`,
        name: "Delete Trip Intruder",
        passwordHash: "hash",
      },
      include: { settings: true },
    });
    const trip = await prisma.trip.create({
      data: {
        userId: owner.id,
        title: "Private trip",
        rawPrompt: "Do not delete.",
        timezone: "Asia/Shanghai",
      },
    });
    getCurrentUserMock.mockResolvedValue(intruder);

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ tripId: trip.id }),
    });

    expect(response.status).toBe(404);
    await expect(
      prisma.trip.count({ where: { id: trip.id } })
    ).resolves.toBe(1);
  });
});
