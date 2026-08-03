import { describe, expect, it } from "vitest";
import { createFallbackChatClient } from "@/lib/agent/chat-client";
import type { AgentChatMessage } from "@/lib/agent/chat-client";

describe("createFallbackChatClient", () => {
  it("creates a complete travel plan after comparing driving and transit", async () => {
    const client = createFallbackChatClient();
    const messages: AgentChatMessage[] = [
      {
        role: "system",
        content: "You are a personal travel-itinerary planning AI.",
      },
      { role: "user", content: "计划宁波两日旅行" },
    ];

    const first = await client.complete({ messages, tools: [] });
    messages.push(first.message);
    messages.push(
      {
        role: "tool",
        toolCallId: "mock-read-settings",
        content: JSON.stringify({
          defaultCity: "宁波",
          timezone: "Asia/Shanghai",
          originName: "家",
          originLngLat: "121.5,29.8",
          routePreference: "balanced",
        }),
      },
      {
        role: "tool",
        toolCallId: "mock-weather",
        content: JSON.stringify({
          kind: "reference",
          city: "宁波",
          summary: "宁波天气参考：多云，24°C",
        }),
      }
    );

    const routes = await client.complete({ messages, tools: [] });
    expect(routes.message.toolCalls?.map((toolCall) => toolCall.name)).toEqual([
      "get_driving_route",
      "get_transit_route",
    ]);
    messages.push(routes.message);
    messages.push(
      {
        role: "tool",
        toolCallId: "mock-travel-driving",
        content: JSON.stringify({
          mode: "driving",
          durationMinutes: 36,
          summary: "驾车路线来自高德",
        }),
      },
      {
        role: "tool",
        toolCallId: "mock-travel-transit",
        content: JSON.stringify({
          mode: "transit",
          durationMinutes: 42,
          summary: "公交/地铁路线来自高德",
        }),
      }
    );

    const createTrip = await client.complete({ messages, tools: [] });
    const createTripCall = createTrip.message.toolCalls?.find(
      (toolCall) => toolCall.name === "create_trip"
    );
    const travelPlan = (
      createTripCall?.arguments as { travelPlan?: Record<string, unknown> }
    )?.travelPlan;

    expect(travelPlan).toMatchObject({
      destination: "Longhu Tianjie",
      weather: {
        summary: "宁波天气参考：多云，24°C",
        dynamicMonitoring: true,
        forecast: expect.any(Array),
        routeRisks: expect.any(Array),
      },
      transport: {
        recommended: "driving",
        driving: { durationMinutes: 36 },
        transit: { durationMinutes: 42 },
      },
      attractions: expect.arrayContaining([
        expect.objectContaining({ category: "natural" }),
        expect.objectContaining({ category: "cultural" }),
      ]),
      lodging: expect.any(Array),
      food: expect.any(Array),
      pitfalls: expect.any(Array),
    });
    expect(
      (travelPlan?.attractions as Array<{ category: string }>).filter(
        (attraction) => attraction.category === "natural"
      )
    ).toHaveLength(4);
  });

  it("does not invent a default origin when settings have no selected origin", async () => {
    const client = createFallbackChatClient();
    const messages: AgentChatMessage[] = [
      { role: "system", content: "test" },
      { role: "user", content: "plan commute" },
    ];

    const first = await client.complete({ messages, tools: [] });
    messages.push(first.message);
    messages.push({
      role: "tool",
      toolCallId: "mock-read-settings",
      content: JSON.stringify({
        defaultCity: "宁波",
        timezone: "Asia/Shanghai",
        originName: null,
        originLngLat: null,
        routePreference: "balanced",
      }),
    });

    const route = await client.complete({ messages, tools: [] });
    const routeCall = route.message.toolCalls?.find(
      (toolCall) => toolCall.name === "get_transit_route"
    );

    expect(routeCall?.arguments.origin).not.toBe("121.5230315924,29.8652491273");
    expect(routeCall?.arguments.origin).toBe("");

    messages.push(route.message);
    messages.push({
      role: "tool",
      toolCallId: "mock-route",
      content: JSON.stringify({ routeMinutes: 42 }),
    });

    const createTrip = await client.complete({ messages, tools: [] });
    const createTripCall = createTrip.message.toolCalls?.find(
      (toolCall) => toolCall.name === "create_trip"
    );
    const createTripArgs = createTripCall?.arguments as
      | {
          legs?: Array<{
            originName?: unknown;
            originLngLat?: unknown;
            routeTitle?: unknown;
          }>;
        }
      | undefined;
    const leg = createTripArgs?.legs?.[0];

    expect(leg?.originName).not.toBe("家");
    expect(leg?.originName).toBe("");
    expect(leg?.originLngLat).toBe("");
    expect(leg?.routeTitle).not.toContain("家");
    expect(leg?.routeTitle).not.toContain("121.5230315924,29.8652491273");
  });
});
