import { prisma } from "@/lib/db";
import { fetchAgentModel } from "@/lib/agent/model-client";
import { executeAgentTool, getAgentToolDefinitions } from "@/lib/agent/tools";
import type {
  AgentModelRequest,
  AgentModelResponse,
  AgentToolAction,
  AgentToolContext,
  AgentTurnContext,
  AgentTurnResult
} from "@/lib/agent/types";

export async function runAgentTurn(input: {
  sessionId: string;
  userText: string;
  context?: AgentTurnContext;
  fetchModel?: (request: AgentModelRequest) => Promise<AgentModelResponse>;
  executeTool?: (name: string, args: Record<string, unknown>, context: AgentToolContext) => Promise<unknown>;
}): Promise<AgentTurnResult> {
  const tools = getAgentToolDefinitions();
  const fetchModel = input.fetchModel || fetchAgentModel;
  const executeTool = input.executeTool || executeAgentTool;
  const modelResponse = await fetchModel({
    sessionId: input.sessionId,
    userText: input.userText,
    context: input.context,
    tools
  });
  const parsed = parseModelResponse(modelResponse);
  const toolCalls = [];
  let tripId: string | null = input.context?.tripId || null;

  for (const action of parsed.actions) {
    const args = action.arguments || {};
    try {
      const result = await executeTool(action.tool, args, {
        ...(input.context || {}),
        sessionId: input.sessionId,
        userText: input.userText
      });
      const record = await prisma.agentToolCall.create({
        data: {
          sessionId: input.sessionId,
          toolName: action.tool,
          argumentsJson: JSON.stringify(args),
          resultJson: JSON.stringify(result || {}),
          status: "done",
          reason: action.reason
        }
      });
      const nextTripId = extractTripId(result);
      if (nextTripId) {
        tripId = nextTripId;
      }
      toolCalls.push({
        id: record.id,
        toolName: action.tool,
        status: "done",
        reason: action.reason || null,
        arguments: args,
        result
      });
    } catch (error) {
      const result = { error: error instanceof Error ? error.message : String(error) };
      const record = await prisma.agentToolCall.create({
        data: {
          sessionId: input.sessionId,
          toolName: action.tool,
          argumentsJson: JSON.stringify(args),
          resultJson: JSON.stringify(result),
          status: "failed",
          reason: action.reason
        }
      });
      toolCalls.push({
        id: record.id,
        toolName: action.tool,
        status: "failed",
        reason: action.reason || null,
        arguments: args,
        result
      });
    }
  }

  return {
    assistantMessage: parsed.response || summarizeToolCalls(toolCalls),
    toolCalls,
    tripId
  };
}

function parseModelResponse(response: AgentModelResponse): { response: string; actions: AgentToolAction[] } {
  const nativeActions = response.message.tool_calls
    ?.map((toolCall) => {
      const name = toolCall.function?.name;
      if (!name) return null;
      return {
        id: toolCall.id,
        tool: name,
        arguments: safeJsonObject(toolCall.function?.arguments || "{}")
      };
    })
    .filter(Boolean) as AgentToolAction[] | undefined;

  if (nativeActions?.length) {
    return {
      response: response.message.content || "",
      actions: nativeActions
    };
  }

  const content = response.message.content || "";
  const parsed = safeJsonObject(content);
  if (Array.isArray(parsed.actions)) {
    return {
      response: typeof parsed.response === "string" ? parsed.response : "",
      actions: parsed.actions
        .map((action) => ({
          tool: String(action.tool || action.name || ""),
          reason: typeof action.reason === "string" ? action.reason : undefined,
          arguments: isRecord(action.arguments) ? action.arguments : {}
        }))
        .filter((action) => action.tool)
    };
  }

  return { response: content, actions: [] };
}

function summarizeToolCalls(toolCalls: AgentTurnResult["toolCalls"]) {
  if (toolCalls.length === 0) {
    return "我已经记录下来了。";
  }
  const failed = toolCalls.find((call) => call.status === "failed");
  if (failed) {
    return `我尝试执行 ${failed.toolName} 时遇到问题，请补充信息后再试。`;
  }
  return "我已经完成这次通勤规划，并记录了执行过程。";
}

function extractTripId(result: unknown) {
  if (!isRecord(result)) return null;
  if (typeof result.tripId === "string") return result.tripId;
  if (isRecord(result.trip) && typeof result.trip.id === "string") return result.trip.id;
  return null;
}

function safeJsonObject(raw: string): Record<string, any> {
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
