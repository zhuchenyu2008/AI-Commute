import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createPlannedTrip } from "@/lib/trips/create-trip";
import type { TravelPlan } from "@/lib/trips/travel-plan";
import { ensureTestDatabase } from "./test-db";

describe("createPlannedTrip", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  it("persists ordered multi-stop trips with routes, buffers, and reminders", async () => {
    const user = await prisma.user.create({
      data: {
        email: `trip-${Date.now()}@example.com`,
        name: "行程规划用户",
        passwordHash: "hash",
      },
    });

    const targetArriveAt = new Date("2026-07-01T10:00:00.000Z");
    const latestDepartAt = new Date("2026-07-01T09:10:00.000Z");

    const trip = await createPlannedTrip({
      userId: user.id,
      rawPrompt: "从家出发，先取咖啡，然后去办公室。",
      timezone: "Asia/Shanghai",
      title: "早晨办公室通勤",
      targetArriveAt,
      stops: [
        {
          name: "家",
          lngLat: "121.500000,31.200000",
          kind: "origin",
        },
        {
          name: "咖啡店",
          address: "咖啡街 88 号",
          lngLat: "121.510000,31.210000",
          plannedStayMin: 5,
          kind: "waypoint",
        },
        {
          name: "办公室",
          lngLat: "121.520000,31.220000",
          targetArriveAt,
          kind: "destination",
        },
      ],
      legs: [
        {
          routeMinutes: 18,
          latestDepartAt,
          mode: "driving",
          routeTitle: "开车去咖啡店",
          segmentTitle: "家到咖啡店",
        },
        {
          routeMinutes: 20,
          mode: "walking",
          routeTitle: "步行去办公室",
          segmentTitle: "咖啡店到办公室",
        },
      ],
    });

    const persisted = await prisma.trip.findUniqueOrThrow({
      where: { id: trip.id },
      include: {
        stops: { orderBy: { order: "asc" } },
        legs: {
          orderBy: { order: "asc" },
          include: {
            routeCandidates: true,
            routeSegments: true,
            bufferComponents: { orderBy: { order: "asc" } },
            reminderJobs: { orderBy: { scheduledFor: "asc" } },
            selectedCandidate: true,
          },
        },
        reminderJobs: true,
      },
    });

    expect(persisted).toMatchObject({
      userId: user.id,
      title: "家-办公室",
      rawPrompt: "从家出发，先取咖啡，然后去办公室。",
      status: "monitoring",
      timezone: "Asia/Shanghai",
      finalStopName: "办公室",
    });
    expect(persisted.stops.map((stop) => stop.name)).toEqual([
      "家",
      "咖啡店",
      "办公室",
    ]);
    expect(persisted.stops.map((stop) => stop.order)).toEqual([0, 1, 2]);

    expect(persisted.legs).toHaveLength(2);
    expect(persisted.legs[0]).toMatchObject({
      order: 0,
      fromStopId: persisted.stops[0].id,
      toStopId: persisted.stops[1].id,
      originName: "家",
      destinationName: "咖啡店",
      latestDepartAt,
      status: "monitoring",
    });
    expect(persisted.legs[1]).toMatchObject({
      order: 1,
      fromStopId: persisted.stops[1].id,
      toStopId: persisted.stops[2].id,
      originName: "咖啡店",
      destinationName: "办公室",
      status: "monitoring",
    });
    expect(persisted.legs[1].latestDepartAt).toBeInstanceOf(Date);

    for (const leg of persisted.legs) {
      expect(leg.routeCandidates).toHaveLength(1);
      expect(leg.selectedCandidateId).toBe(leg.routeCandidates[0].id);
      expect(leg.selectedCandidate).toMatchObject({
        id: leg.routeCandidates[0].id,
        selected: true,
      });
      expect(leg.routeSegments).toHaveLength(1);
      expect(leg.routeSegments[0]).toMatchObject({
        legId: leg.id,
        candidateId: leg.routeCandidates[0].id,
      });
      expect(leg.bufferComponents.map((component) => component.category)).toEqual([
        "venue",
        "transfer",
        "weather_context",
      ]);
      expect(
        leg.bufferComponents.find(
          (component) => component.category === "weather_context"
        )?.minutes
      ).toBe(0);
      expect(leg.reminderJobs.map((job) => job.kind)).toEqual([
        "recheck",
        "recheck",
        "recheck",
        "recheck",
        "recheck",
        "depart_now",
      ]);
    }

    expect(persisted.reminderJobs).toHaveLength(12);
  });

  it("accepts destination stops with explicit leg endpoints", async () => {
    const user = await prisma.user.create({
      data: {
        email: `trip-agent-shape-${Date.now()}@example.com`,
        name: "智能体行程用户",
        passwordHash: "hash",
      },
    });

    const trip = await createPlannedTrip({
      userId: user.id,
      rawPrompt: "明天 9:15 到龙湖天街",
      timezone: "Asia/Shanghai",
      title: "龙湖天街",
      stops: [
        {
          order: 1,
          name: "龙湖天街",
          lngLat: "121.616000,29.868000",
          kind: "destination",
        },
      ],
      legs: [
        {
          order: 1,
          originName: "家",
          originLngLat: "121.5230315924,29.8652491273",
          destinationName: "龙湖天街",
          destinationLngLat: "121.616000,29.868000",
          routeMinutes: 36,
          bufferMinutes: 15,
          totalMinutes: 51,
          latestDepartAt: new Date("2026-07-01T00:24:00.000Z"),
        },
      ],
    });

    const persisted = await prisma.trip.findUniqueOrThrow({
      where: { id: trip.id },
      include: {
        stops: true,
        legs: {
          include: {
            routeCandidates: true,
            bufferComponents: true,
            reminderJobs: true,
          },
        },
      },
    });

    expect(persisted.stops).toHaveLength(1);
    expect(persisted.legs).toHaveLength(1);
    expect(persisted.legs[0]).toMatchObject({
      order: 1,
      fromStopId: null,
      toStopId: persisted.stops[0].id,
      originName: "家",
      originLngLat: "121.5230315924,29.8652491273",
      destinationName: "龙湖天街",
      destinationLngLat: "121.616000,29.868000",
    });
    expect(persisted.legs[0].routeCandidates[0]).toMatchObject({
      routeMinutes: 36,
      bufferMinutes: 15,
      totalMinutes: 51,
    });
    expect(
      persisted.legs[0].bufferComponents.find(
        (component) => component.category === "weather_context"
      )?.minutes
    ).toBe(0);
    expect(persisted.legs[0].reminderJobs).toHaveLength(6);
  });

  it("persists the structured travel plan alongside the itinerary graph", async () => {
    const user = await prisma.user.create({
      data: {
        email: `trip-travel-plan-${Date.now()}@example.com`,
        name: "旅行规划用户",
        passwordHash: "hash",
      },
    });
    const travelPlan: TravelPlan = {
      destination: "宁波",
      summary: "两天旅行规划",
      days: 2,
      weather: {
        city: "宁波",
        summary: "多云，24°C",
        advice: "自然景点留意降雨",
        source: "高德天气参考",
      },
      transport: {
        recommended: "mixed",
        reason: "郊区自驾与市区公共交通结合",
        driving: {
          summary: "约 36 分钟",
          reason: "方便串联郊区景点",
          durationMinutes: 36,
        },
        transit: {
          summary: "约 48 分钟",
          reason: "市区停车压力小",
          durationMinutes: 48,
        },
        localMovement: "市内优先公共交通",
      },
      attractions: [
        {
          name: "东钱湖",
          category: "natural",
          reason: "自然景观",
          day: 1,
        },
        {
          name: "天一阁",
          category: "cultural",
          reason: "历史人文",
          day: 2,
        },
      ],
      lodging: [
        {
          name: "鼓楼周边",
          area: "市中心",
          reason: "交通和餐饮集中",
        },
      ],
      food: [
        {
          name: "宁波本帮菜",
          mustTry: "海鲜和汤圆",
          reason: "本地口味代表",
        },
      ],
      pitfalls: [
        {
          title: "先查预约",
          detail: "热门景点先看官方公告",
          severity: "high",
        },
      ],
    };

    const trip = await createPlannedTrip({
      userId: user.id,
      rawPrompt: "规划宁波两日旅行",
      timezone: "Asia/Shanghai",
      title: "宁波旅行",
      finalStopName: "宁波",
      stops: [
        {
          order: 1,
          name: "宁波",
          lngLat: "121.55,29.87",
          kind: "destination",
        },
      ],
      legs: [
        {
          order: 1,
          originName: "北京",
          originLngLat: "116.4,39.9",
          destinationName: "宁波",
          destinationLngLat: "121.55,29.87",
          routeMinutes: 120,
          mode: "mixed",
        },
      ],
      travelPlan,
    });

    const persisted = await prisma.trip.findUniqueOrThrow({
      where: { id: trip.id },
    });

    expect(persisted.travelPlanJson).toBe(JSON.stringify(travelPlan));
    expect(JSON.parse(persisted.travelPlanJson ?? "null")).toMatchObject({
      destination: "宁波",
      transport: { recommended: "mixed" },
      attractions: expect.arrayContaining([
        expect.objectContaining({ category: "natural" }),
        expect.objectContaining({ category: "cultural" }),
      ]),
    });
  });

  it("normalizes created trip titles to origin-destination", async () => {
    const user = await prisma.user.create({
      data: {
        email: `title-normalize-${Date.now()}@example.com`,
        name: "Title User",
        passwordHash: "hash",
      },
    });

    const trip = await createPlannedTrip({
      userId: user.id,
      rawPrompt: "明天10:00 外事学校到东钱湖地铁站",
      timezone: "Asia/Shanghai",
      title: "明天10:00 外事学校到东钱湖地铁站",
      stops: [
        {
          order: 1,
          name: "东钱湖地铁站",
          lngLat: "121.2,29.2",
          kind: "destination",
        },
      ],
      legs: [
        {
          order: 1,
          originName: "外事学校",
          originLngLat: "121.1,29.1",
          destinationName: "东钱湖地铁站",
          destinationLngLat: "121.2,29.2",
          routeMinutes: 25,
          bufferComponents: [
            {
              category: "transfer",
              label: "进站缓冲",
              minutes: 5,
              reason: "预留进站时间",
            },
          ],
        },
      ],
    });

    await expect(
      prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })
    ).resolves.toMatchObject({
      title: "外事学校-东钱湖地铁站",
    });
  });
  it("uses the final destination for multi-leg route titles", async () => {
    const user = await prisma.user.create({
      data: {
        email: `title-final-destination-${Date.now()}@example.com`,
        name: "Multi Leg Title User",
        passwordHash: "hash",
      },
    });

    const trip = await createPlannedTrip({
      userId: user.id,
      rawPrompt: "从家出发先去咖啡店再到办公室",
      timezone: "Asia/Shanghai",
      title: "家到办公室",
      stops: [
        {
          order: 0,
          name: "家",
          lngLat: "121.1,29.1",
          kind: "origin",
        },
        {
          order: 1,
          name: "咖啡店",
          lngLat: "121.2,29.2",
          kind: "waypoint",
        },
        {
          order: 2,
          name: "办公室",
          lngLat: "121.3,29.3",
          kind: "destination",
        },
      ],
      legs: [
        {
          order: 0,
          originName: "家",
          originLngLat: "121.1,29.1",
          destinationName: "咖啡店",
          destinationLngLat: "121.2,29.2",
          routeMinutes: 15,
        },
        {
          order: 1,
          originName: "咖啡店",
          originLngLat: "121.2,29.2",
          destinationName: "办公室",
          destinationLngLat: "121.3,29.3",
          routeMinutes: 20,
        },
      ],
    });

    await expect(
      prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })
    ).resolves.toMatchObject({
      title: "家-办公室",
    });
  });
  it("orders title endpoints by stop and leg order values", async () => {
    const user = await prisma.user.create({
      data: {
        email: `title-order-${Date.now()}@example.com`,
        name: "Ordered Title User",
        passwordHash: "hash",
      },
    });

    const trip = await createPlannedTrip({
      userId: user.id,
      rawPrompt: "乱序输入但按 order 从家到办公室",
      timezone: "Asia/Shanghai",
      title: "乱序行程",
      stops: [
        {
          order: 2,
          name: "办公室",
          lngLat: "121.3,29.3",
          kind: "destination",
        },
        {
          order: 0,
          name: "家",
          lngLat: "121.1,29.1",
          kind: "origin",
        },
        {
          order: 1,
          name: "咖啡店",
          lngLat: "121.2,29.2",
          kind: "waypoint",
        },
      ],
      legs: [
        {
          order: 1,
          originName: "咖啡店",
          originLngLat: "121.2,29.2",
          destinationName: "办公室",
          destinationLngLat: "121.3,29.3",
          routeMinutes: 20,
        },
        {
          order: 0,
          originName: "家",
          originLngLat: "121.1,29.1",
          destinationName: "咖啡店",
          destinationLngLat: "121.2,29.2",
          routeMinutes: 15,
        },
      ],
    });

    await expect(
      prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })
    ).resolves.toMatchObject({
      title: "家-办公室",
      finalStopName: "办公室",
    });
  });
});
