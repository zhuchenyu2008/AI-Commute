import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  cancelTripMonitoring,
  getMonitoringSummary,
} from "@/lib/trips/monitoring";
import { ensureTestDatabase } from "./test-db";

describe("trip monitoring", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  it("cancels an owned trip, its legs, and scheduled reminder jobs", async () => {
    const user = await prisma.user.create({
      data: {
        email: `monitoring-${Date.now()}@example.com`,
        name: "Monitoring User",
        passwordHash: "hash",
      },
    });
    const trip = await prisma.trip.create({
      data: {
        userId: user.id,
        title: "Morning commute",
        rawPrompt: "Arrive by 9.",
        timezone: "Asia/Shanghai",
        status: "monitoring",
        stops: {
          create: [
            { order: 0, name: "Home", kind: "origin" },
            { order: 1, name: "Office" },
          ],
        },
      },
      include: { stops: true },
    });
    const firstLeg = await prisma.tripLeg.create({
      data: {
        tripId: trip.id,
        order: 0,
        fromStopId: trip.stops[0].id,
        toStopId: trip.stops[1].id,
        originName: "Home",
        originLngLat: "121.500000,31.200000",
        destinationName: "Office",
        status: "monitoring",
      },
    });
    const secondLeg = await prisma.tripLeg.create({
      data: {
        tripId: trip.id,
        order: 1,
        fromStopId: trip.stops[0].id,
        toStopId: trip.stops[1].id,
        originName: "Office",
        originLngLat: "121.510000,31.210000",
        destinationName: "Cafe",
        status: "monitoring",
      },
    });

    await prisma.reminderJob.createMany({
      data: [
        {
          tripId: trip.id,
          legId: firstLeg.id,
          kind: "recheck",
          scheduledFor: new Date("2026-06-29T00:30:00.000Z"),
          status: "scheduled",
          dedupeKey: `${trip.id}:${firstLeg.id}:scheduled`,
          payloadJson: "{}",
        },
        {
          tripId: trip.id,
          legId: secondLeg.id,
          kind: "depart_now",
          scheduledFor: new Date("2026-06-29T01:00:00.000Z"),
          status: "scheduled",
          dedupeKey: `${trip.id}:${secondLeg.id}:scheduled`,
          payloadJson: "{}",
        },
        {
          tripId: trip.id,
          legId: firstLeg.id,
          kind: "recheck",
          scheduledFor: new Date("2026-06-29T00:00:00.000Z"),
          status: "sent",
          dedupeKey: `${trip.id}:${firstLeg.id}:sent`,
          payloadJson: "{}",
        },
      ],
    });

    await expect(
      cancelTripMonitoring({ tripId: trip.id, userId: user.id })
    ).resolves.toMatchObject({ status: "cancelled" });

    await expect(
      prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })
    ).resolves.toMatchObject({ status: "cancelled" });
    await expect(
      prisma.tripLeg.findMany({
        where: { tripId: trip.id },
        orderBy: { order: "asc" },
      })
    ).resolves.toEqual([
      expect.objectContaining({ id: firstLeg.id, status: "cancelled" }),
      expect.objectContaining({ id: secondLeg.id, status: "cancelled" }),
    ]);
    await expect(
      prisma.reminderJob.findMany({
        where: { tripId: trip.id },
        orderBy: { scheduledFor: "asc" },
      })
    ).resolves.toEqual([
      expect.objectContaining({ status: "sent" }),
      expect.objectContaining({ status: "cancelled" }),
      expect.objectContaining({ status: "cancelled" }),
    ]);
  });

  it("does not cancel a trip for a different user", async () => {
    const owner = await prisma.user.create({
      data: {
        email: `owner-${Date.now()}@example.com`,
        name: "Owner",
        passwordHash: "hash",
      },
    });
    const foreignUser = await prisma.user.create({
      data: {
        email: `foreign-${Date.now()}@example.com`,
        name: "Foreign User",
        passwordHash: "hash",
      },
    });
    const trip = await prisma.trip.create({
      data: {
        userId: owner.id,
        title: "Private trip",
        rawPrompt: "Keep this private.",
        timezone: "Asia/Shanghai",
        status: "monitoring",
      },
    });

    await expect(
      cancelTripMonitoring({ tripId: trip.id, userId: foreignUser.id })
    ).rejects.toThrow("Trip not found.");
    await expect(
      prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })
    ).resolves.toMatchObject({ status: "monitoring" });
  });

  it("summarizes monitored duration and scheduled reminder count", () => {
    expect(
      getMonitoringSummary({
        createdAt: new Date("2026-06-28T00:00:00.000Z"),
        now: new Date("2026-06-28T01:35:00.000Z"),
        scheduledReminderCount: 3,
      })
    ).toEqual({
      monitoredFor: "1小时35分钟",
      scheduledReminderCount: 3,
    });
  });
});
