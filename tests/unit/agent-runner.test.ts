import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  agentToolCall: {
    create: vi.fn()
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock
}));

describe("agent runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to JSON tool actions when native tool calls are not available", async () => {
    prismaMock.agentToolCall.create.mockImplementation(async ({ data }) => ({
      id: "tool-call-1",
      ...data
    }));
    const fetchModel = vi.fn().mockResolvedValue({
      message: {
        role: "assistant",
        content: JSON.stringify({
          response: "我会先查看资料。",
          actions: [
            {
              tool: "get_profile",
              reason: "需要知道默认出发地",
              arguments: {}
            }
          ]
        })
      },
      supportsNativeTools: false
    });
    const executeTool = vi.fn().mockResolvedValue({ profile: { city: "Ningbo" } });

    const { runAgentTurn } = await import("@/lib/agent/runner");
    const result = await runAgentTurn({
      sessionId: "session-1",
      userText: "明天 9:15 到龙湖天街",
      fetchModel,
      executeTool
    });

    expect(fetchModel).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([expect.objectContaining({ name: "get_profile" })])
      })
    );
    expect(executeTool).toHaveBeenCalledWith("get_profile", {}, expect.objectContaining({ sessionId: "session-1" }));
    expect(prismaMock.agentToolCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "session-1",
        toolName: "get_profile",
        status: "done",
        reason: "需要知道默认出发地"
      })
    });
    expect(result.assistantMessage).toBe("我会先查看资料。");
    expect(result.toolCalls).toHaveLength(1);
  });
});
