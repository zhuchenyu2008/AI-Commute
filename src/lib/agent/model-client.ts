import { env, hasOpenAIConfig } from "@/lib/env";
import type { AgentModelRequest, AgentModelResponse, AgentToolAction } from "@/lib/agent/types";

export async function fetchAgentModel(request: AgentModelRequest): Promise<AgentModelResponse> {
  if (!hasOpenAIConfig()) {
    return localAgentModel(request);
  }

  const native = await fetchChatCompletion(request, true).catch(() => null);
  if (native?.message?.tool_calls?.length) {
    return { ...native, supportsNativeTools: true };
  }

  const jsonFallback = await fetchChatCompletion(request, false).catch(() => null);
  if (jsonFallback) {
    return { ...jsonFallback, supportsNativeTools: false };
  }

  return localAgentModel(request);
}

async function fetchChatCompletion(request: AgentModelRequest, useNativeTools: boolean): Promise<AgentModelResponse> {
  const body: Record<string, unknown> = {
    model: env.openaiCompatModel,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: useNativeTools ? nativeToolSystemPrompt() : jsonActionSystemPrompt()
      },
      {
        role: "user",
        content: buildUserPrompt(request)
      }
    ]
  };

  if (useNativeTools) {
    body.tools = request.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
    body.tool_choice = "auto";
  } else {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(new URL("/v1/chat/completions", env.openaiCompatBaseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.openaiCompatApiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Model request failed: ${response.status}`);
  }
  const data = await response.json();
  return {
    message: data.choices?.[0]?.message || { role: "assistant", content: "" },
    supportsNativeTools: useNativeTools
  };
}

function nativeToolSystemPrompt() {
  return [
    "You are the commute planning agent.",
    "You decide which tools to call, what to inspect, how to create trips, reminders, rechecks, and memories.",
    "Use tools for facts and actions. Do not invent route durations.",
    "When the work is complete, answer briefly in Chinese with what you did and the most important next action."
  ].join("\n");
}

function jsonActionSystemPrompt() {
  return [
    "You are the commute planning agent.",
    "Native tools are unavailable, so output one JSON object only.",
    "Shape: {\"response\":\"短中文回复\",\"actions\":[{\"tool\":\"tool_name\",\"reason\":\"why\",\"arguments\":{}}]}.",
    "Use available tool names only. Prefer checking profile and memories before creating or updating a trip."
  ].join("\n");
}

function buildUserPrompt(request: AgentModelRequest) {
  return JSON.stringify({
    sessionId: request.sessionId,
    userText: request.userText,
    context: request.context || {},
    availableTools: request.tools.map((tool) => tool.name)
  });
}

function localAgentModel(request: AgentModelRequest): AgentModelResponse {
  const actions: AgentToolAction[] = [];
  if (request.context?.scheduled && request.context.tripId) {
    actions.push({
      tool: "recheck_route_watch",
      reason: "到达提醒复算时间，由 agent 重新检查路线和提醒策略",
      arguments: {
        tripId: request.context.tripId,
        jobId: request.context.jobId,
        payload: request.context.payload || {}
      }
    });
    return jsonResponse("我会复算这趟行程，并按当前变化决定是否提醒。", actions);
  }

  if (/取消|停止|不用提醒|停掉/.test(request.userText) && request.context?.tripId) {
    actions.push({
      tool: "cancel_trip",
      reason: "用户要求停止当前行程监控",
      arguments: { tripId: request.context.tripId }
    });
    return jsonResponse("我会停止这趟行程的提醒和监控。", actions);
  }

  actions.push(
    { tool: "get_profile", reason: "确认默认出发地、城市和时区", arguments: {} },
    { tool: "list_memories", reason: "读取已保存地点和偏好", arguments: { status: "confirmed" } },
    {
      tool: "create_commute_plan",
      reason: "根据用户这一句话完成查找、路线规划、提醒和记忆写入",
      arguments: { text: request.userText }
    }
  );

  return jsonResponse("我会接管这次通勤：读取资料和记忆，查询路线，然后设置提醒。", actions);
}

function jsonResponse(response: string, actions: AgentToolAction[]): AgentModelResponse {
  return {
    supportsNativeTools: false,
    message: {
      role: "assistant",
      content: JSON.stringify({ response, actions })
    }
  };
}
