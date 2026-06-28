import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  runPlanningSession,
  startPlanningSession,
} from "@/lib/agent/planner";
import type { AgentChatClient } from "@/lib/agent/chat-client";
import { ensureTestDatabase } from "./test-db";

describe("agent planning sessions", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  it("starts a visible running session with the initial user message", async () => {
    const user = await prisma.user.create({
      data: {
        email: `agent-start-${Date.now()}@example.com`,
        name: "Agent Starter",
        passwordHash: "hash",
      },
    });

    const session = await startPlanningSession({
      userId: user.id,
      prompt: "明天早上规划去龙湖天街的通勤。",
    });

    const persisted = await prisma.agentSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { messages: true },
    });

    expect(persisted).toMatchObject({
      userId: user.id,
      status: "running",
      purpose: "planning",
      prompt: "明天早上规划去龙湖天街的通勤。",
      retryCount: 0,
      timeoutMs: 600000,
      tripId: null,
    });
    expect(persisted.messages).toHaveLength(1);
    expect(persisted.messages[0]).toMatchObject({
      role: "user",
      content: "明天早上规划去龙湖天街的通勤。",
    });
  });

  it("runs a planning session into a completed trip with tool logs and messages", async () => {
    const user = await prisma.user.create({
      data: {
        email: `agent-run-${Date.now()}@example.com`,
        name: "Agent Runner",
        passwordHash: "hash",
        settings: {
          create: {
            defaultCity: "Ningbo",
            timezone: "Asia/Shanghai",
            originName: "Home",
            originLngLat: "121.5230315924,29.8652491273",
            routePreference: "balanced",
          },
        },
      },
    });

    const session = await startPlanningSession({
      userId: user.id,
      prompt: "明天 9:15 喝完咖啡后到龙湖天街",
    });

    const result = await runPlanningSession(session.id);

    expect(result.status).toBe("completed");
    expect(result.tripId).toEqual(expect.any(String));

    const persisted = await prisma.agentSession.findUniqueOrThrow({
      where: { id: session.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        toolCalls: { orderBy: { createdAt: "asc" } },
        trip: {
          include: {
            stops: { orderBy: { order: "asc" } },
            legs: {
              orderBy: { order: "asc" },
              include: {
                bufferComponents: { orderBy: { order: "asc" } },
                routeCandidates: true,
              },
            },
          },
        },
      },
    });

    expect(persisted.status).toBe("completed");
    expect(persisted.tripId).toBe(result.tripId);
    expect(persisted.retryCount).toBe(0);
    expect(persisted.messages.map((message) => message.role)).toContain("assistant");
    expect(
      persisted.messages.some((message) =>
        message.content.includes("天气仅作为参考信息")
      )
    ).toBe(true);

    expect(persisted.toolCalls.map((call) => call.name)).toEqual(
      expect.arrayContaining([
        "search_poi",
        "get_weather_reference",
        "get_transit_route",
      ])
    );
    const poiSearch = persisted.toolCalls.find(
      (call) => call.name === "search_poi"
    );
    expect(poiSearch?.requestJson).toContain('"keywords":"龙湖天街"');
    for (const call of persisted.toolCalls) {
      expect(call.status).toBe("completed");
      expect(call.requestJson).toBeTruthy();
      expect(call.responseJson).toBeTruthy();
      expect(call.durationMs).toEqual(expect.any(Number));
    }

    expect(persisted.trip).toBeTruthy();
    expect(persisted.trip?.status).toBe("monitoring");
    expect(persisted.trip?.agentSessionId).toBe(session.id);
    expect(persisted.trip?.stops).toHaveLength(1);
    expect(persisted.trip?.stops[0]).toMatchObject({
      order: 1,
      name: "宁波龙湖天街",
      kind: "destination",
    });
    expect(persisted.trip?.legs).toHaveLength(1);
    expect(persisted.trip?.legs[0]).toMatchObject({
      order: 1,
      originName: "Home",
      originLngLat: "121.5230315924,29.8652491273",
      destinationName: "宁波龙湖天街",
    });
    expect(
      persisted.trip?.legs[0].bufferComponents.map(
        (component) => component.category
      )
    ).toEqual(["venue", "transfer", "weather_context"]);
    expect(
      persisted.trip?.legs[0].bufferComponents.find(
        (component) => component.category === "weather_context"
      )
    ).toMatchObject({
      minutes: 0,
      source: "weather_context",
    });
  });

  it("lets the AI choose AMap tools, route mode, and buffer details", async () => {
    const user = await prisma.user.create({
      data: {
        email: `agent-ai-led-${Date.now()}@example.com`,
        name: "AI Led Planner",
        passwordHash: "hash",
        settings: {
          create: {
            defaultCity: "宁波",
            timezone: "Asia/Shanghai",
            originName: "家",
            originLngLat: "121.5230315924,29.8652491273",
            routePreference: "balanced",
          },
        },
      },
    });

    const session = await startPlanningSession({
      userId: user.id,
      prompt: "明天 9:15 到龙湖天街电影院，天气不好就别死板推荐骑车",
    });

    const requestedTools: string[] = [];
    const chatClient: AgentChatClient = {
      async complete({ messages }) {
        const toolResultCount = messages.filter(
          (message) => message.role === "tool"
        ).length;

        if (toolResultCount === 0) {
          requestedTools.push("search_poi", "get_weather_reference");
          return {
            message: {
              role: "assistant",
              content: "我先查地点和天气，不用固定规则替我决定。",
              toolCalls: [
                {
                  id: "call-poi",
                  name: "search_poi",
                  arguments: { keywords: "龙湖天街电影院", city: "宁波" },
                },
                {
                  id: "call-weather",
                  name: "get_weather_reference",
                  arguments: { city: "宁波" },
                },
              ],
            },
          };
        }

        if (toolResultCount === 2) {
          requestedTools.push("get_transit_route", "get_bicycling_route");
          return {
            message: {
              role: "assistant",
              content: "我比较公交和骑行，不让应用层替我排好序。",
              toolCalls: [
                {
                  id: "call-transit",
                  name: "get_transit_route",
                  arguments: {
                    origin: "121.5230315924,29.8652491273",
                    destination: "121.616,29.868",
                    city: "宁波",
                    cityd: "宁波",
                  },
                },
                {
                  id: "call-bike",
                  name: "get_bicycling_route",
                  arguments: {
                    origin: "121.5230315924,29.8652491273",
                    destination: "121.616,29.868",
                    city: "宁波",
                    cityd: "宁波",
                  },
                },
              ],
            },
          };
        }

        requestedTools.push("create_trip");
        return {
          message: {
            role: "assistant",
            content: "我最终选择骑行，并给出自己的缓冲拆解。",
            toolCalls: [
              {
                id: "call-create-trip",
                name: "create_trip",
                arguments: {
                  title: "龙湖天街电影院",
                  timezone: "Asia/Shanghai",
                  targetArriveAt: "2026-06-29T01:15:00.000Z",
                  finalStopName: "宁波龙湖天街",
                  stops: [
                    {
                      order: 1,
                      name: "宁波龙湖天街",
                      address: "浙江省宁波市龙湖天街",
                      lngLat: "121.616,29.868",
                      kind: "destination",
                      targetArriveAt: "2026-06-29T01:15:00.000Z",
                    },
                  ],
                  legs: [
                    {
                      order: 1,
                      originName: "家",
                      originLngLat: "121.5230315924,29.8652491273",
                      destinationName: "宁波龙湖天街",
                      destinationLngLat: "121.616,29.868",
                      routeMinutes: 24,
                      bufferMinutes: 7,
                      totalMinutes: 31,
                      mode: "bicycling",
                      routeTitle: "AI 选择骑行路线",
                      routeRationale:
                        "比较高德公交和骑行结果后，AI 决定骑行时间更可控。",
                      segmentTitle: "骑行到龙湖天街",
                      segmentDetail: "由 AI 根据高德工具结果选择。",
                      segmentSource: "amap",
                      targetArriveAt: "2026-06-29T01:15:00.000Z",
                      source: { decidedBy: "ai", comparedModes: ["transit", "bicycling"] },
                      bufferComponents: [
                        {
                          category: "parking",
                          label: "停车落锁",
                          minutes: 3,
                          reason: "AI 认为共享单车停车需要额外时间。",
                          source: "agent_inference",
                        },
                        {
                          category: "venue",
                          label: "进商场找影院",
                          minutes: 4,
                          reason: "AI 认为从商场入口到影院需要预留时间。",
                          source: "agent_inference",
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        };
      },
    };

    const result = await runPlanningSession(session.id, { chatClient });

    expect(result.status).toBe("completed");
    expect(requestedTools).toEqual([
      "search_poi",
      "get_weather_reference",
      "get_transit_route",
      "get_bicycling_route",
      "create_trip",
    ]);

    const persisted = await prisma.agentSession.findUniqueOrThrow({
      where: { id: session.id },
      include: {
        toolCalls: { orderBy: { createdAt: "asc" } },
        trip: {
          include: {
            legs: {
              include: {
                bufferComponents: { orderBy: { order: "asc" } },
                selectedCandidate: true,
              },
            },
          },
        },
      },
    });

    expect(persisted.toolCalls.map((call) => call.name)).toEqual([
      "search_poi",
      "get_weather_reference",
      "get_transit_route",
      "get_bicycling_route",
      "create_trip",
    ]);
    expect(persisted.trip?.legs[0].selectedCandidate).toMatchObject({
      mode: "bicycling",
      routeMinutes: 24,
      bufferMinutes: 7,
      totalMinutes: 31,
      title: "AI 选择骑行路线",
    });
    expect(
      persisted.trip?.legs[0].bufferComponents.map((component) => ({
        category: component.category,
        minutes: component.minutes,
      }))
    ).toEqual([
      { category: "parking", minutes: 3 },
      { category: "venue", minutes: 4 },
    ]);
  });

  it("fails route tools clearly when no origin is available", async () => {
    const user = await prisma.user.create({
      data: {
        email: `agent-no-origin-${Date.now()}@example.com`,
        name: "No Origin Planner",
        passwordHash: "hash",
        settings: {
          create: {
            defaultCity: "宁波",
            timezone: "Asia/Shanghai",
            routePreference: "balanced",
          },
        },
      },
    });

    const session = await startPlanningSession({
      userId: user.id,
      prompt: "明天 9:15 到宁波龙湖天街",
    });
    const chatClient: AgentChatClient = {
      async complete({ messages }) {
        const toolResultCount = messages.filter(
          (message) => message.role === "tool"
        ).length;

        if (toolResultCount === 0) {
          return {
            message: {
              role: "assistant",
              content: "先查路线。",
              toolCalls: [
                {
                  id: "call-transit-no-origin",
                  name: "get_transit_route",
                  arguments: {
                    destination: "121.616,29.868",
                    city: "宁波",
                    cityd: "宁波",
                  },
                },
              ],
            },
          };
        }

        throw new Error("Planner should stop after the route tool fails.");
      },
    };

    const result = await runPlanningSession(session.id, { chatClient });

    expect(result.status).toBe("failed");
    expect(result.tripId).toBeNull();

    const persisted = await prisma.agentSession.findUniqueOrThrow({
      where: { id: session.id },
      include: {
        toolCalls: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    const routeCall = persisted.toolCalls.find(
      (toolCall) => toolCall.name === "get_transit_route"
    );

    expect(persisted.status).toBe("failed");
    expect(routeCall).toMatchObject({
      status: "failed",
      error: "请先在设置中选择默认出发点，或在本次请求中提供出发点。",
    });
    expect(persisted.messages.at(-1)?.content).toContain(
      "请先在设置中选择默认出发点"
    );
  });
});
