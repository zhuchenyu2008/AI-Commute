import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  enableTripShare,
  getPublicTripShareByToken,
  getTripShareState,
  revokeTripShare,
  TripShareNotFoundError,
} from "@/lib/trips/share-service";
import { ensureTestDatabase } from "./test-db";

describe("trip share service", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: "trip-share-service-" } },
    });
  });

  it("keeps one active token, revokes it, and rotates it on re-enable", async () => {
    const { userId, tripId } = await createTripFixture("lifecycle");

    const first = await enableTripShare(tripId, userId);
    const second = await enableTripShare(tripId, userId);

    expect(second.token).toBe(first.token);
    expect(await getPublicTripShareByToken(first.token)).toMatchObject({
      title: "Shared lifecycle trip",
      finalStopName: "City Museum",
      totalMinutes: 35,
    });

    await revokeTripShare(tripId, userId);

    expect(await getPublicTripShareByToken(first.token)).toBeNull();
    await expect(getTripShareState(tripId, userId)).resolves.toMatchObject({
      token: first.token,
      revokedAt: expect.any(Date),
    });

    const reenabled = await enableTripShare(tripId, userId);
    expect(reenabled.token).not.toBe(first.token);
    expect(reenabled.revokedAt).toBeNull();
  });

  it("hides trip existence from another user", async () => {
    const { tripId } = await createTripFixture("owner");
    const intruder = await prisma.user.create({
      data: {
        email: `trip-share-service-intruder-${Date.now()}@example.com`,
        name: "Trip Share Intruder",
        passwordHash: "hash",
      },
    });

    await expect(enableTripShare(tripId, intruder.id)).rejects.toBeInstanceOf(
      TripShareNotFoundError
    );
  });
});

async function createTripFixture(key: string) {
  const user = await prisma.user.create({
    data: {
      email: `trip-share-service-${key}-${Date.now()}@example.com`,
      name: "Trip Share Owner",
      passwordHash: "hash",
    },
  });
  const trip = await prisma.trip.create({
    data: {
      userId: user.id,
      title: `Shared ${key} trip`,
      rawPrompt: "private prompt",
      status: "monitoring",
      timezone: "Asia/Shanghai",
      targetArriveAt: new Date("2026-07-20T10:50:00.000Z"),
      finalStopName: "City Museum",
    },
  });
  const origin = await prisma.tripStop.create({
    data: {
      tripId: trip.id,
      order: 0,
      name: "Home",
      lngLat: "121.1,29.1",
      notes: "private note",
      kind: "origin",
    },
  });
  const destination = await prisma.tripStop.create({
    data: {
      tripId: trip.id,
      order: 1,
      name: "City Museum",
      lngLat: "121.2,29.2",
      kind: "destination",
    },
  });
  const leg = await prisma.tripLeg.create({
    data: {
      tripId: trip.id,
      order: 0,
      fromStopId: origin.id,
      toStopId: destination.id,
      originName: origin.name,
      originLngLat: origin.lngLat ?? "",
      destinationName: destination.name,
      destinationLngLat: destination.lngLat,
      latestDepartAt: new Date("2026-07-20T10:15:00.000Z"),
      targetArriveAt: trip.targetArriveAt,
      status: "monitoring",
    },
  });
  const candidate = await prisma.routeCandidate.create({
    data: {
      legId: leg.id,
      key: `${key}-route`,
      title: "Metro route",
      mode: "transit",
      routeMinutes: 30,
      bufferMinutes: 5,
      totalMinutes: 35,
      selected: true,
      rationale: "Fastest route",
    },
  });
  await prisma.tripLeg.update({
    where: { id: leg.id },
    data: { selectedCandidateId: candidate.id },
  });
  await prisma.routeSegment.create({
    data: {
      legId: leg.id,
      candidateId: candidate.id,
      order: 0,
      mode: "metro",
      title: "Take metro line 4",
      detail: "Seven stops",
      minutes: 30,
      rawJson: "private raw response",
    },
  });

  return { userId: user.id, tripId: trip.id };
}
