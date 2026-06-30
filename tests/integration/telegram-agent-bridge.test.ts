import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createTelegramAgentBridge } from "@/lib/telegram/agent-bridge";
import { createMockAmapClient } from "@/lib/amap/mock";
import type { AgentChatClient } from "@/lib/agent/chat-client";
import { ensureTestDatabase } from "./test-db";

describe("telegram agent bridge", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  it("streams persisted agent timeline events while planning runs", async () => {
    const user = await createUserWithSettings("telegram-bridge-progress");
    const progressMessages: string[] = [];
    const sessionIds: string[] = [];
    const bridge = createTelegramAgentBridge({
      amapClient: createMockAmapClient(),
      chatClient: createTwoStepTripChatClient(),
    });

    const result = await bridge.startPlanning({
      userId: user.id,
      prompt: "明天九点到办公室",
      progress: {
        onSessionStarted(sessionId) {
          sessionIds.push(sessionId);
        },
        onProgressMessage(message) {
          progressMessages.push(message);
        },
      },
    });

    expect(result.tripId).toEqual(expect.any(String));
    expect(sessionIds).toEqual([result.sessionId]);
    expect(progressMessages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("用户请求"),
        expect.stringContaining("智能体更新"),
        expect.stringContaining("工具调用：搜索地点"),
        expect.stringContaining("工具调用：创建行程"),
      ])
    );
    expect(
      progressMessages.some(
        (message) => message.includes("工具调用：创建行程") && message.includes("已完成")
      )
    ).toBe(true);
  });
});

async function createUserWithSettings(label: string) {
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
    },
  });
}

function createTwoStepTripChatClient(): AgentChatClient {
  return {
    async complete({ messages }) {
      const toolMessages = messages.filter((message) => message.role === "tool");

      if (toolMessages.length === 0) {
        return {
          message: {
            role: "assistant",
            content: "先搜索目的地。",
            toolCalls: [
              {
                id: "bridge-search-poi",
                name: "search_poi",
                arguments: { keywords: "办公室", city: "Ningbo" },
              },
            ],
          },
        };
      }

      return {
        message: {
          role: "assistant",
          content: "创建最终行程。",
          toolCalls: [
            {
              id: "bridge-create-trip",
              name: "create_trip",
              arguments: {
                title: "Home-Office",
                timezone: "Asia/Shanghai",
                finalStopName: "Office",
                stops: [
                  {
                    order: 1,
                    name: "Office",
                    lngLat: "121.2,29.2",
                    kind: "destination",
                  },
                ],
                legs: [
                  {
                    order: 1,
                    originName: "Home",
                    originLngLat: "121.1,29.1",
                    destinationName: "Office",
                    destinationLngLat: "121.2,29.2",
                    routeMinutes: 30,
                    bufferMinutes: 5,
                    totalMinutes: 35,
                    mode: "transit",
                    routeTitle: "地铁到办公室",
                    routeRationale: "稳定。",
                    segmentTitle: "乘坐地铁",
                    segmentDetail: "测试路线。",
                    segmentSource: "amap",
                    bufferComponents: [
                      {
                        category: "transfer",
                        label: "换乘缓冲",
                        minutes: 5,
                        reason: "预留换乘时间。",
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
}
