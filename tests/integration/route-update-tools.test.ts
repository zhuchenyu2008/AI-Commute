import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createPlannedTrip } from "@/lib/trips/create-trip";
import {
  replaceTripRoute,
  updateTripSummary,
} from "@/lib/trips/route-updates";
import { ensureTestDatabase } from "./test-db";

describe("route update helpers", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  it("transactionally replaces a planned trip route, summary, buffers, candidates, and reminders", async () => {
    const user = await prisma.user.create({
      data: {
        email: `route-update-${Date.now()}@example.com`,
        name: "Route Update User",
        passwordHash: "hash",
      },
    });
    const targetArriveAt = new Date("2026-07-02T01:30:00.000Z");
    const replacementDepartAt = new Date("2026-07-02T00:55:00.000Z");
    const trip = await createPlannedTrip({
      userId: user.id,
      rawPrompt: "Original commute.",
      timezone: "Asia/Shanghai",
      title: "Home-Office",
      finalStopName: "Office",
      targetArriveAt,
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
          mode: "transit",
          bufferComponents: [
            {
              category: "transfer",
              label: "Original transfer",
              minutes: 5,
              reason: "Original route buffer.",
            },
          ],
        },
      ],
    });
    const original = await prisma.trip.findUniqueOrThrow({
      where: { id: trip.id },
      include: {
        stops: true,
        legs: { include: { routeCandidates: true, bufferComponents: true } },
        reminderJobs: true,
      },
    });

    await updateTripSummary({
      tripId: trip.id,
      userId: user.id,
      title: "Temporary title",
      finalStopName: "Temporary stop",
      status: "monitoring",
    });

    await replaceTripRoute({
      tripId: trip.id,
      userId: user.id,
      title: "Home-Gym",
      finalStopName: "Gym",
      targetArriveAt,
      stops: [
        {
          order: 0,
          name: "Home",
          lngLat: "121.1,29.1",
          kind: "origin",
        },
        {
          order: 1,
          name: "Cafe",
          lngLat: "121.15,29.15",
          kind: "waypoint",
          plannedStayMin: 10,
        },
        {
          order: 2,
          name: "Gym",
          lngLat: "121.3,29.3",
          kind: "destination",
          targetArriveAt,
        },
      ],
      legs: [
        {
          order: 0,
          originName: "Home",
          originLngLat: "121.1,29.1",
          destinationName: "Cafe",
          destinationLngLat: "121.15,29.15",
          routeMinutes: 12,
          mode: "walking",
          routeTitle: "Walk to cafe",
          routeRationale: "Short walk is reliable.",
          segmentTitle: "Home to Cafe",
          segmentDetail: "Replacement first leg.",
          latestDepartAt: replacementDepartAt,
          bufferComponents: [
            {
              category: "venue",
              label: "Cafe pickup",
              minutes: 3,
              reason: "Pickup time.",
            },
          ],
        },
        {
          order: 1,
          originName: "Cafe",
          originLngLat: "121.15,29.15",
          destinationName: "Gym",
          destinationLngLat: "121.3,29.3",
          routeMinutes: 20,
          bufferMinutes: 4,
          totalMinutes: 24,
          mode: "bicycling",
          routeTitle: "Bike to gym",
          routeRationale: "Fastest revised option.",
          segmentTitle: "Cafe to Gym",
          segmentDetail: "Replacement final leg.",
          targetArriveAt,
          bufferComponents: [
            {
              category: "parking",
              label: "Bike parking",
              minutes: 4,
              reason: "Lock the bike.",
            },
            {
              category: "weather_context",
              label: "Weather reference",
              minutes: 8,
              reason: "Weather is context only.",
              source: "weather_context",
            },
          ],
        },
      ],
    });

    const updated = await prisma.trip.findUniqueOrThrow({
      where: { id: trip.id },
      include: {
        stops: { orderBy: { order: "asc" } },
        legs: {
          orderBy: { order: "asc" },
          include: {
            selectedCandidate: true,
            routeCandidates: true,
            routeSegments: { orderBy: { order: "asc" } },
            bufferComponents: { orderBy: { order: "asc" } },
            reminderJobs: true,
          },
        },
        reminderJobs: true,
      },
    });

    expect(updated).toMatchObject({
      title: "Home-Gym",
      finalStopName: "Gym",
      status: "monitoring",
      targetArriveAt,
    });
    expect(updated.stops.map((stop) => stop.name)).toEqual([
      "Home",
      "Cafe",
      "Gym",
    ]);
    expect(updated.stops.map((stop) => stop.id)).not.toEqual(
      original.stops.map((stop) => stop.id)
    );
    expect(updated.legs).toHaveLength(2);
    expect(updated.legs.map((leg) => leg.destinationName)).toEqual([
      "Cafe",
      "Gym",
    ]);
    expect(updated.legs[1].selectedCandidate).toMatchObject({
      mode: "bicycling",
      routeMinutes: 20,
      bufferMinutes: 4,
      totalMinutes: 24,
      selected: true,
      title: "Bike to gym",
    });
    expect(
      updated.legs[1].bufferComponents.map((component) => ({
        category: component.category,
        minutes: component.minutes,
      }))
    ).toEqual([
      { category: "parking", minutes: 4 },
      { category: "weather_context", minutes: 0 },
    ]);
    for (const leg of updated.legs) {
      expect(leg.routeCandidates).toHaveLength(1);
      expect(leg.routeSegments).toHaveLength(1);
      expect(leg.reminderJobs).toHaveLength(6);
      expect(leg.reminderJobs.every((job) => job.status === "scheduled")).toBe(
        true
      );
    }
    expect(updated.reminderJobs).toHaveLength(12);
    expect(
      updated.reminderJobs.some((job) =>
        original.reminderJobs.some((oldJob) => oldJob.id === job.id)
      )
    ).toBe(false);
  });
});
