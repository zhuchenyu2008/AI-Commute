import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import {
  continueAgentSession,
  runPlanningSession,
  startPlanningSession,
} from "@/lib/agent/planner";
import type {
  AgentChatClient,
  AgentChatMessage,
} from "@/lib/agent/chat-client";
import { createMockAmapClient } from "@/lib/amap/mock";
import { ensureTestDatabase } from "./test-db";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
const getCurrentUserMock = vi.hoisted(() =>
  vi.fn<() => Promise<CurrentUser | null>>()
);

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, getCurrentUser: getCurrentUserMock };
});

describe("agent planning sessions", () => {
  const amapClient = createMockAmapClient();

  beforeAll(async () => {
    await ensureTestDatabase();
  });

  beforeEach(() => {
    getCurrentUserMock.mockReset();
  });

  it("rejects starting a planning session until the user selects a default origin", async () => {
    const { POST } = await import("@app/api/agent-sessions/route");
    const user = await prisma.user.create({
      data: {
        email: `agent-origin-guard-${Date.now()}@example.com`,
        name: "Origin Guard User",
        passwordHash: "hash",
        settings: {
          create: {
            defaultCity: "Ningbo",
            timezone: "Asia/Shanghai",
            originName: null,
            originLngLat: null,
            routePreference: "balanced",
          },
        },
      },
      include: { settings: true },
    });
    getCurrentUserMock.mockResolvedValue(user);

    const response = await POST(
      new Request("http://localhost/api/agent-sessions", {
        method: "POST",
        body: JSON.stringify({ prompt: "Plan my commute tomorrow morning." }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/default origin|settings/i);
    expect(payload.actionHref).toBe("/settings");
    await expect(
      prisma.agentSession.count({ where: { userId: user.id } })
    ).resolves.toBe(0);
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
      prompt: "Plan a commute to Longhu mall tomorrow morning.",
    });

    const persisted = await prisma.agentSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { messages: true },
    });

    expect(persisted).toMatchObject({
      userId: user.id,
      status: "running",
      purpose: "planning",
      prompt: "Plan a commute to Longhu mall tomorrow morning.",
      retryCount: 0,
      timeoutMs: 600000,
      tripId: null,
    });
    expect(persisted.messages).toHaveLength(1);
    expect(persisted.messages[0]).toMatchObject({
      role: "user",
      content: "Plan a commute to Longhu mall tomorrow morning.",
    });
  });

  it("runs a planning session into a completed trip with tool logs and messages", async () => {
    const user = await createUserWithSettings("agent-run");
    const session = await startPlanningSession({
      userId: user.id,
      prompt: "Plan a 9:15 commute to the office.",
    });
    const chatClient = createTripChatClient({
      finalStopName: "Office",
      destinationLngLat: "121.2,29.2",
      routeMinutes: 42,
      mode: "transit",
    });

    const result = await runPlanningSession(session.id, {
      amapClient,
      chatClient,
    });

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
    expect(persisted.messages.map((message) => message.role)).toContain(
      "assistant"
    );
    expect(persisted.toolCalls.map((call) => call.name)).toEqual(
      expect.arrayContaining([
        "search_poi",
        "get_weather_reference",
        "get_transit_route",
        "create_trip",
      ])
    );
    for (const call of persisted.toolCalls) {
      expect(call.status).toBe("completed");
      expect(call.requestJson).toBeTruthy();
      expect(call.responseJson).toBeTruthy();
      expect(call.durationMs).toEqual(expect.any(Number));
    }
    expect(persisted.trip).toMatchObject({
      status: "monitoring",
      agentSessionId: session.id,
      finalStopName: "Office",
    });
    expect(persisted.trip?.stops).toHaveLength(1);
    expect(persisted.trip?.legs).toHaveLength(1);
    expect(persisted.trip?.legs[0].bufferComponents.map((c) => c.category)).toEqual([
      "transfer",
    ]);
  });

  it("injects confirmed memories into every planning run before the AI calls tools", async () => {
    const user = await createUserWithSettings("agent-memory-context", {
      memories: {
        create: {
          kind: "preference",
          label: "Confirmed memory: prefers cycling",
          valueJson: JSON.stringify({ mode: "bicycling" }),
        },
      },
    });
    const session = await startPlanningSession({
      userId: user.id,
      prompt: "Plan a commute to the station.",
    });
    const seenMessages: string[] = [];
    const chatClient = createTripChatClient({
      finalStopName: "Station",
      destinationLngLat: "121.3,29.3",
      routeMinutes: 25,
      mode: "transit",
      onComplete({ messages }) {
        seenMessages.push(...messages.map((message) => message.content));
      },
    });

    await runPlanningSession(session.id, { amapClient, chatClient });

    expect(seenMessages.join("\n")).toContain(
      "Confirmed memory: prefers cycling"
    );
  });

  it("lets the AI choose AMap tools, route mode, and buffer details", async () => {
    const user = await createUserWithSettings("agent-ai-led");
    const session = await startPlanningSession({
      userId: user.id,
      prompt: "Compare transit and biking to the cinema.",
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
              content: "Read POI and weather first.",
              toolCalls: [
                {
                  id: "call-poi",
                  name: "search_poi",
                  arguments: { keywords: "cinema", city: "Ningbo" },
                },
                {
                  id: "call-weather",
                  name: "get_weather_reference",
                  arguments: { city: "Ningbo" },
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
              content: "Compare transit and bike.",
              toolCalls: [
                {
                  id: "call-transit",
                  name: "get_transit_route",
                  arguments: {
                    origin: "121.1,29.1",
                    destination: "121.4,29.4",
                    city: "Ningbo",
                    cityd: "Ningbo",
                  },
                },
                {
                  id: "call-bike",
                  name: "get_bicycling_route",
                  arguments: {
                    origin: "121.1,29.1",
                    destination: "121.4,29.4",
                    city: "Ningbo",
                    cityd: "Ningbo",
                  },
                },
              ],
            },
          };
        }

        requestedTools.push("create_trip");
        return createTripToolResponse({
          finalStopName: "Cinema",
          destinationLngLat: "121.4,29.4",
          routeMinutes: 24,
          bufferMinutes: 7,
          totalMinutes: 31,
          mode: "bicycling",
          routeTitle: "AI selected bike route",
          bufferComponents: [
            {
              category: "parking",
              label: "Bike parking",
              minutes: 3,
              reason: "Lock the bike.",
            },
            {
              category: "venue",
              label: "Find screen",
              minutes: 4,
              reason: "Walk inside the mall.",
            },
          ],
        });
      },
    };

    const result = await runPlanningSession(session.id, {
      amapClient,
      chatClient,
    });

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
      title: "AI selected bike route",
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
            defaultCity: "Ningbo",
            timezone: "Asia/Shanghai",
            originName: "   ",
            originLngLat: "   ",
            routePreference: "balanced",
          },
        },
      },
    });
    const session = await startPlanningSession({
      userId: user.id,
      prompt: "Plan a route without origin.",
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
              content: "Query route first.",
              toolCalls: [
                {
                  id: "call-transit-no-origin",
                  name: "get_transit_route",
                  arguments: {
                    origin: "   ",
                    destination: "121.616,29.868",
                    city: "Ningbo",
                    cityd: "Ningbo",
                  },
                },
              ],
            },
          };
        }

        throw new Error("Planner should stop after the route tool fails.");
      },
    };

    const result = await runPlanningSession(session.id, {
      amapClient,
      chatClient,
    });

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
    expect(routeCall).toMatchObject({ status: "failed" });
    expect(routeCall?.error).toMatch(/default origin|settings/i);
    expect(persisted.messages.at(-1)?.content).toMatch(
      /default origin|settings/i
    );
  });

  it("continues an existing session with route update tools and memory candidates", async () => {
    const user = await createUserWithSettings("agent-continue", {
      memories: {
        create: {
          kind: "preference",
          label: "Prefers cycling when weather allows",
          valueJson: JSON.stringify({ preferredMode: "bicycling" }),
        },
      },
    });
    const session = await startPlanningSession({
      userId: user.id,
      prompt: "Plan tomorrow commute to the office.",
    });
    const planned = await runPlanningSession(session.id, {
      amapClient,
      chatClient: createTripChatClient({
        finalStopName: "Office",
        destinationLngLat: "121.2,29.2",
        routeMinutes: 35,
        mode: "transit",
      }),
    });
    expect(planned.tripId).toEqual(expect.any(String));

    const seenTools: string[][] = [];
    const seenMessages: string[] = [];
    let calls = 0;
    const chatClient: AgentChatClient = {
      async complete({ messages, tools }) {
        calls += 1;
        seenTools.push(tools.map((tool) => tool.name));
        seenMessages.push(...messages.map((message) => message.content));

        if (calls === 1) {
          return {
            message: {
              role: "assistant",
              content: "Update the existing trip and remember the preference.",
              toolCalls: [
                {
                  id: "update-summary",
                  name: "update_trip_summary",
                  arguments: {
                    title: "Home-Gym",
                    finalStopName: "Gym",
                  },
                },
                {
                  id: "memory-candidate",
                  name: "create_memory_candidate",
                  arguments: {
                    kind: "preference",
                    label: "Prefers gym detours after work",
                    valueJson: { afterWorkStop: "Gym" },
                  },
                },
              ],
            },
          };
        }

        return {
          message: {
            role: "assistant",
            content: "The current trip has been updated.",
          },
        };
      },
    };

    const result = await continueAgentSession(
      {
        userId: user.id,
        sessionId: session.id,
        message: "Change the destination to the gym and remember this.",
      },
      { amapClient, chatClient }
    );

    expect(result.status).toBe("completed");
    expect(result.tripId).toBe(planned.tripId);
    expect(seenTools[0]).toEqual(
      expect.arrayContaining([
        "read_current_trip",
        "update_trip_summary",
        "replace_trip_stops",
        "replace_trip_legs",
        "select_route_candidate",
        "replace_reminder_schedule",
        "cancel_trip_monitoring",
        "create_memory_candidate",
        "get_transit_route",
        "create_trip",
      ])
    );
    expect(seenMessages.join("\n")).toContain(
      "Prefers cycling when weather allows"
    );

    const persisted = await prisma.agentSession.findUniqueOrThrow({
      where: { id: session.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        toolCalls: { orderBy: { createdAt: "asc" } },
        trip: true,
      },
    });

    expect(persisted.status).toBe("completed");
    expect(persisted.messages.map((m) => m.content)).toContain(
      "Change the destination to the gym and remember this."
    );
    expect(persisted.toolCalls.map((call) => call.name)).toEqual(
      expect.arrayContaining(["update_trip_summary", "create_memory_candidate"])
    );
    expect(persisted.trip).toMatchObject({
      title: "Home-Gym",
      finalStopName: "Gym",
    });
    await expect(
      prisma.memoryCandidate.findFirstOrThrow({
        where: {
          userId: user.id,
          label: "Prefers gym detours after work",
          status: "pending",
        },
      })
    ).resolves.toMatchObject({
      kind: "preference",
      valueJson: JSON.stringify({ afterWorkStop: "Gym" }),
    });
  }, 15000);
});

async function createUserWithSettings(
  label: string,
  extraData: Record<string, unknown> = {}
) {
  return prisma.user.create({
    data: {
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      name: label,
      passwordHash: "hash",
      settings: {
        create: {
          defaultCity: "Ningbo",
          timezone: "Asia/Shanghai",
          originName: "Home",
          originLngLat: "121.1,29.1",
          routePreference: "balanced",
        },
      },
      ...extraData,
    },
  });
}

function createTripChatClient(input: {
  finalStopName: string;
  destinationLngLat: string;
  routeMinutes: number;
  mode: string;
  onComplete?: (input: { messages: AgentChatMessage[] }) => void;
}): AgentChatClient {
  return {
    async complete({ messages }) {
      const toolResultCount = messages.filter((message) => message.role === "tool")
        .length;

      if (toolResultCount === 0) {
        return {
          message: {
            role: "assistant",
            content: "Read planning evidence.",
            toolCalls: [
              {
                id: "call-search-poi",
                name: "search_poi",
                arguments: { keywords: input.finalStopName, city: "Ningbo" },
              },
              {
                id: "call-weather",
                name: "get_weather_reference",
                arguments: { city: "Ningbo" },
              },
              {
                id: "call-transit",
                name: "get_transit_route",
                arguments: {
                  destination: input.destinationLngLat,
                  city: "Ningbo",
                  cityd: "Ningbo",
                },
              },
            ],
          },
        };
      }

      input.onComplete?.({ messages });
      return createTripToolResponse(input);
    },
  };
}

function createTripToolResponse(input: {
  finalStopName: string;
  destinationLngLat: string;
  routeMinutes: number;
  mode: string;
  bufferMinutes?: number;
  totalMinutes?: number;
  routeTitle?: string;
  bufferComponents?: Array<{
    category: string;
    label: string;
    minutes: number;
    reason: string;
    source?: string;
  }>;
}) {
  const bufferComponents =
    input.bufferComponents ?? [
      {
        category: "transfer",
        label: "Transfer buffer",
        minutes: 5,
        reason: "Leave time for station walking.",
      },
    ];
  const bufferMinutes =
    input.bufferMinutes ??
    bufferComponents.reduce((total, component) => total + component.minutes, 0);

  return {
    message: {
      role: "assistant" as const,
      content: "Create final trip.",
      toolCalls: [
        {
          id: "call-create-trip",
          name: "create_trip",
          arguments: {
            title: `Home-${input.finalStopName}`,
            timezone: "Asia/Shanghai",
            finalStopName: input.finalStopName,
            stops: [
              {
                order: 1,
                name: input.finalStopName,
                lngLat: input.destinationLngLat,
                kind: "destination",
              },
            ],
            legs: [
              {
                order: 1,
                originName: "Home",
                originLngLat: "121.1,29.1",
                destinationName: input.finalStopName,
                destinationLngLat: input.destinationLngLat,
                routeMinutes: input.routeMinutes,
                bufferMinutes,
                totalMinutes: input.totalMinutes ?? input.routeMinutes + bufferMinutes,
                mode: input.mode,
                routeTitle: input.routeTitle ?? `${input.mode} route`,
                routeRationale: "AI selected this route from tool evidence.",
                segmentTitle: `${input.mode} segment`,
                segmentDetail: "Generated from deterministic test tools.",
                segmentSource: "amap",
                source: { source: "test-agent" },
                bufferComponents,
              },
            ],
          },
        },
      ],
    },
  };
}
