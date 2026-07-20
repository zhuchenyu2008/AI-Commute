import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { toPublicTripShareData } from "@/lib/trips/share-view";

export class TripShareNotFoundError extends Error {}

export function createTripShareToken() {
  return randomBytes(24).toString("base64url");
}

async function assertOwnedTrip(tripId: string, userId: string) {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    select: { id: true },
  });

  if (!trip) {
    throw new TripShareNotFoundError();
  }
}

export async function getTripShareState(tripId: string, userId: string) {
  await assertOwnedTrip(tripId, userId);
  return prisma.tripShare.findUnique({ where: { tripId } });
}

export async function enableTripShare(tripId: string, userId: string) {
  await assertOwnedTrip(tripId, userId);
  const existing = await prisma.tripShare.findUnique({ where: { tripId } });

  if (existing && !existing.revokedAt) {
    return existing;
  }

  return prisma.tripShare.upsert({
    where: { tripId },
    create: { tripId, token: createTripShareToken() },
    update: { token: createTripShareToken(), revokedAt: null },
  });
}

export async function revokeTripShare(tripId: string, userId: string) {
  await assertOwnedTrip(tripId, userId);
  const existing = await prisma.tripShare.findUnique({ where: { tripId } });

  if (!existing) {
    return null;
  }

  return prisma.tripShare.update({
    where: { tripId },
    data: { revokedAt: new Date() },
  });
}

export async function getPublicTripShareByToken(token: string) {
  const share = await prisma.tripShare.findFirst({
    where: { token, revokedAt: null },
    include: {
      trip: {
        include: {
          stops: { orderBy: { order: "asc" } },
          legs: {
            orderBy: { order: "asc" },
            include: {
              selectedCandidate: true,
              routeCandidates: { orderBy: { createdAt: "asc" } },
              routeSegments: { orderBy: { order: "asc" } },
            },
          },
        },
      },
    },
  });

  return share ? toPublicTripShareData(share.trip) : null;
}
