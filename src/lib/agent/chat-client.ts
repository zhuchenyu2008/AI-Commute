import OpenAI from "openai";
import type { TravelPlan } from "@/lib/trips/travel-plan";

export type AgentChatRole = "system" | "user" | "assistant" | "tool";

export type AgentChatToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentChatMessage = {
  role: AgentChatRole;
  content: string;
  toolCallId?: string;
  toolCalls?: AgentChatToolCall[];
};

export type AgentChatToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AgentChatCompletionInput = {
  messages: AgentChatMessage[];
  tools: AgentChatToolDefinition[];
  signal?: AbortSignal;
};

export type AgentChatCompletion = {
  message: AgentChatMessage;
};

export type AgentChatClient = {
  complete(input: AgentChatCompletionInput): Promise<AgentChatCompletion>;
};

type EnvSource = Partial<Record<string, string | undefined>>;

const DEFAULT_MODEL = "gpt-4o-mini";

function parseToolArguments(value: string | null | undefined) {
  if (!value) return {};

  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function toOpenAiMessages(messages: AgentChatMessage[]) {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool" as const,
        content: message.content,
        tool_call_id: message.toolCallId ?? "",
      };
    }

    if (message.role === "assistant") {
      return {
        role: "assistant" as const,
        content: message.content,
        tool_calls: message.toolCalls?.map((toolCall) => ({
          id: toolCall.id,
          type: "function" as const,
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments),
          },
        })),
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

export function createOpenAiChatClient(
  env: EnvSource = process.env
): AgentChatClient {
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return createFallbackChatClient();
  }

  const client = new OpenAI({
    apiKey,
    baseURL: env.OPENAI_BASE_URL?.trim() || undefined,
  });
  const model = env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  return {
    async complete(input) {
      const completion = await client.chat.completions.create(
        {
          model,
          messages: toOpenAiMessages(input.messages),
          tools: input.tools.map((tool) => ({
            type: "function" as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
          tool_choice: "auto",
        },
        { signal: input.signal }
      );

      const message = completion.choices[0]?.message;

      if (!message) {
        throw new Error("OpenAI 未返回规划消息。");
      }

      return {
        message: {
          role: "assistant",
          content: message.content ?? "",
          toolCalls: message.tool_calls?.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: parseToolArguments(toolCall.function.arguments),
          })),
        },
      };
    },
  };
}

function getFallbackUserMessage(messages: AgentChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")
    ?.content;
}

function toFallbackBeijingIso(input: {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
}) {
  const { day, hour, minute, month, year } = input;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return undefined;
  }

  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute)).toISOString();
}

function extractFallbackTargetArriveAts(messages: AgentChatMessage[]) {
  const userMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  const dateMatch = userMessage?.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);

  if (!userMessage || !dateMatch) return [];

  const [, rawYear, rawMonth, rawDay] = dateMatch;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);

  return [...userMessage.matchAll(/\b(\d{1,2}):(\d{2})\b/g)]
    .map((match) =>
      toFallbackBeijingIso({
        day,
        hour: Number(match[1]),
        minute: Number(match[2]),
        month,
        year,
      })
    )
    .filter((value): value is string => Boolean(value));
}

function extractFallbackTargetArriveAt(messages: AgentChatMessage[]) {
  return extractFallbackTargetArriveAts(messages).at(-1);
}

function extractFallbackContextTargetArriveAt(messages: AgentChatMessage[]) {
  const values: string[] = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "system") continue;

    const dateMatch = message.content.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!dateMatch) continue;

    const [, rawYear, rawMonth, rawDay] = dateMatch;
    const year = Number(rawYear);
    const month = Number(rawMonth);
    const day = Number(rawDay);

    for (const match of message.content.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
      const value = toFallbackBeijingIso({
        day,
        hour: Number(match[1]),
        minute: Number(match[2]),
        month,
        year,
      });

      if (value) values.push(value);
    }
  }

  return values.at(-1);
}

function isFallbackSchoolOfficePrompt(messages: AgentChatMessage[]) {
  const userMessage = getFallbackUserMessage(messages)?.toLowerCase() ?? "";

  return (
    userMessage.includes("foreign affairs school") &&
    userMessage.includes("office")
  );
}

function isFallbackCoffeeLonghuPrompt(messages: AgentChatMessage[]) {
  const userMessage = getFallbackUserMessage(messages)?.toLowerCase() ?? "";

  const mentionsCoffee =
    userMessage.includes("coffee") || userMessage.includes("咖啡");
  const mentionsLonghu =
    userMessage.includes("longhu") || userMessage.includes("龙湖");

  return mentionsCoffee && mentionsLonghu;
}

function isFallbackAddStopPrompt(messages: AgentChatMessage[]) {
  const userMessage = getFallbackUserMessage(messages)?.toLowerCase() ?? "";
  const mentionsCoffee =
    userMessage.includes("coffee") || userMessage.includes("咖啡");
  const mentionsAddStop =
    userMessage.includes("add") ||
    userMessage.includes("stop") ||
    userMessage.includes("中途") ||
    userMessage.includes("加");

  return mentionsCoffee && mentionsAddStop;
}

function getFallbackStopStayMinutes(
  messages: AgentChatMessage[],
  fallbackMinutes: number
) {
  const userMessage = getFallbackUserMessage(messages) ?? "";
  const match = userMessage.match(/(\d+)\s*(?:minutes?|mins?|min|分钟|分)/i);
  const minutes = match ? Number(match[1]) : fallbackMinutes;

  return Number.isFinite(minutes) && minutes > 0 ? minutes : fallbackMinutes;
}

function getFallbackCurrentTripId(messages: AgentChatMessage[]) {
  const currentTripMessage = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "system" &&
        message.content.includes("Current trip id:")
    )?.content;
  const match = currentTripMessage?.match(/Current trip id:\s*([^.]+)\./);
  const tripId = match?.[1]?.trim();

  return tripId && tripId !== "none" ? tripId : undefined;
}

function getFallbackRelativeArrivalDeltaMinutes(messages: AgentChatMessage[]) {
  const userMessage = getFallbackUserMessage(messages)?.toLowerCase() ?? "";
  const match = userMessage.match(/(\d+)\s*(?:minutes?|mins?|min|鍒嗛挓|鍒?)/);

  if (!match) return undefined;

  const minutes = Number(match[1]);
  if (!Number.isFinite(minutes)) return undefined;

  if (
    userMessage.includes("earlier") ||
    userMessage.includes("鎻愬墠") ||
    userMessage.includes("鎻愭棭")
  ) {
    return -minutes;
  }

  if (
    userMessage.includes("later") ||
    userMessage.includes("delay") ||
    userMessage.includes("postpone") ||
    userMessage.includes("鎺ㄨ繜") ||
    userMessage.includes("寤跺悗") ||
    userMessage.includes("鏅?")
  ) {
    return minutes;
  }

  return undefined;
}

function offsetFallbackIso(iso: string | undefined, deltaMinutes: number) {
  if (!iso) return undefined;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;

  return new Date(date.getTime() + deltaMinutes * 60_000).toISOString();
}

function extractFallbackCurrentTripTargetArriveAt(
  toolMessages: AgentChatMessage[]
) {
  const currentTripMessage = toolMessages.find(
    (message) => message.toolCallId === "mock-read-current-trip"
  );

  if (!currentTripMessage) return undefined;

  const trip = JSON.parse(currentTripMessage.content) as {
    targetArriveAt?: string | null;
    legs?: Array<{ targetArriveAt?: string | null }>;
  };

  return (
    trip.targetArriveAt ??
    [...(trip.legs ?? [])]
      .reverse()
      .find((leg) => Boolean(leg.targetArriveAt))?.targetArriveAt ??
    undefined
  );
}

type FallbackTravelMode = "transit" | "walking" | "bicycling";

type FallbackDestination = {
  address: string;
  lngLat: string;
  name: string;
};

function getFallbackDestination(messages: AgentChatMessage[]): FallbackDestination {
  const userMessage = getFallbackUserMessage(messages)?.toLowerCase() ?? "";

  if (userMessage.includes("foreign affairs school")) {
    return {
      address: "Foreign Affairs School",
      lngLat: "121.560,29.860",
      name: "Foreign Affairs School",
    };
  }

  return {
    address: "Longhu Tianjie",
    lngLat: "121.616,29.868",
    name: "Longhu Tianjie",
  };
}

function getFallbackTravelMode(messages: AgentChatMessage[]): FallbackTravelMode {
  const userMessage = getFallbackUserMessage(messages)?.toLowerCase() ?? "";

  if (
    userMessage.includes("bicycling") ||
    userMessage.includes("cycling") ||
    userMessage.includes("bike") ||
    userMessage.includes("楠戣")
  ) {
    return "bicycling";
  }

  if (userMessage.includes("walking") || userMessage.includes("walk")) {
    return "walking";
  }

  return "transit";
}

function isFallbackTravelSession(messages: AgentChatMessage[]) {
  return messages.some(
    (message) =>
      message.role === "system" &&
      message.content.includes("personal travel-itinerary planning AI")
  );
}

function readFallbackToolPayload(
  toolMessages: AgentChatMessage[],
  toolCallId: string
) {
  const message = toolMessages.find(
    (candidate) => candidate.toolCallId === toolCallId
  );

  if (!message) return {};

  try {
    const parsed = JSON.parse(message.content) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readFallbackRouteDuration(
  toolMessages: AgentChatMessage[],
  toolCallId: string,
  fallback: number
) {
  const duration = Number(
    readFallbackToolPayload(toolMessages, toolCallId).durationMinutes
  );

  return Number.isFinite(duration) && duration > 0
    ? Math.round(duration)
    : fallback;
}

function readFallbackRouteSummary(
  toolMessages: AgentChatMessage[],
  toolCallId: string,
  fallback: string
) {
  const summary = readFallbackToolPayload(toolMessages, toolCallId).summary;
  return typeof summary === "string" && summary.trim() ? summary : fallback;
}

function buildFallbackTravelPlan(input: {
  destination: FallbackDestination;
  weatherSummary: string;
  drivingMinutes: number;
  drivingSummary: string;
  transitMinutes: number;
  transitSummary: string;
}): TravelPlan {
  const recommended =
    input.drivingMinutes <= input.transitMinutes ? "driving" : "transit";
  const recommendedLabel = recommended === "driving" ? "自驾" : "公共交通";

  return {
    destination: input.destination.name,
    summary:
      "这是无外部大模型配置时的本地演示旅行规划，展示天气、交通、景点、住宿、美食和避坑信息的完整结构。",
    days: 2,
    weather: {
      city: "宁波",
      summary: input.weatherSummary,
      advice: "天气仅作参考：自然景点按实时情况调整，出发前再次确认降雨、风力和景区公告。",
      source: "高德天气参考",
    },
    transport: {
      recommended,
      reason: `${recommendedLabel}预计更省时；已同时保留自驾与公共交通方案，最终请结合停车、拥堵、换乘和天气确认。`,
      driving: {
        summary: `约 ${input.drivingMinutes} 分钟`,
        reason: "适合携带行李或串联郊区景点，但需提前确认停车和高峰拥堵。",
        durationMinutes: input.drivingMinutes,
        route: input.drivingSummary,
      },
      transit: {
        summary: `约 ${input.transitMinutes} 分钟`,
        reason: "适合市区活动，减少停车压力；雨天需给站外步行和换乘留余量。",
        durationMinutes: input.transitMinutes,
        route: input.transitSummary,
      },
      localMovement: "市区景点之间优先公共交通，最后一公里根据天气选择步行或短途接驳。",
    },
    attractions: [
      {
        name: "东钱湖",
        category: "natural",
        reason: "适合安排半天自然景观，节奏舒缓，也方便根据天气缩短湖畔停留。",
        address: "宁波东钱湖景区",
        day: 1,
        stayMinutes: 180,
        bestTime: "上午或傍晚",
        weatherNote: "雨天减少湖边长距离步行，关注临时开放信息。",
      },
      {
        name: "天一阁",
        category: "cultural",
        reason: "补足宁波历史人文内容，室内与园林结合，适合放在天气不稳定的一天。",
        address: "宁波天一阁博物院",
        day: 2,
        stayMinutes: 120,
        bestTime: "上午",
        weatherNote: "闭馆日、预约和客流以官方公告为准。",
      },
    ],
    lodging: [
      {
        name: "市中心住宿区",
        area: "天一广场或鼓楼周边",
        reason: "公共交通和餐饮更集中，适合两天行程减少往返。",
        budget: "按预算选择连锁或精品酒店",
        notes: "订房前核对停车、取消政策和周末价格。",
      },
    ],
    food: [
      {
        name: "宁波本帮菜",
        area: "鼓楼、天一广场周边",
        mustTry: "海鲜、宁波汤圆",
        reason: "覆盖本地口味代表，适合安排在市区活动日。",
        budget: "先看菜单和人均价格",
        notes: "海鲜按时价结算，点单前确认规格和加工费。",
      },
    ],
    pitfalls: [
      {
        title: "景区预约与开放时间",
        detail: "热门景点、博物馆和节假日活动可能需要预约，出发前查官方公告。",
        severity: "high",
      },
      {
        title: "自驾停车与拥堵",
        detail: "郊区景点周末停车位可能紧张，市区行程不要只按驾车导航时间倒排。",
        severity: "medium",
      },
      {
        title: "海鲜价格与加工费",
        detail: "海鲜、时价菜和加工项目先问清单价、重量和服务费，保留消费凭证。",
        severity: "medium",
      },
    ],
  };
}

function getFallbackRouteToolName(mode: FallbackTravelMode) {
  if (mode === "bicycling") return "get_bicycling_route";
  if (mode === "walking") return "get_walking_route";
  return "get_transit_route";
}

function getFallbackRouteMinutes(mode: FallbackTravelMode) {
  if (mode === "bicycling") return 34;
  if (mode === "walking") return 58;
  return 42;
}

function getFallbackBufferMinutes(mode: FallbackTravelMode) {
  if (mode === "bicycling") return 8;
  if (mode === "walking") return 12;
  return 10;
}

function getFallbackRouteTitle(
  mode: FallbackTravelMode,
  destinationName = "Longhu Tianjie"
) {
  if (mode === "bicycling") return `Bicycling to ${destinationName}`;
  if (mode === "walking") return `Walking to ${destinationName}`;
  return `Transit to ${destinationName}`;
}

function getFallbackRouteRationale(mode: FallbackTravelMode) {
  if (mode === "bicycling") {
    return "mock agent switches to bicycling because the user requested bicycling if weather allows.";
  }

  if (mode === "walking") {
    return "mock agent switches to walking because the user requested a walking route.";
  }

  return "mock agent selects transit as the balanced default route.";
}

export function createFallbackChatClient(): AgentChatClient {
  return {
    async complete({ messages }) {
      const toolMessages = messages.filter((message) => message.role === "tool");
      const currentTripId = getFallbackCurrentTripId(messages);
      const isTravelSession = isFallbackTravelSession(messages);
      const destination = getFallbackDestination(messages);

      if (toolMessages.length === 0) {
        return {
          message: {
            role: "assistant",
            content:
              isTravelSession
                ? "mock agent 读取设置、地点和天气，准备旅行方案。"
                : "mock agent 读取设置、记忆、地点和天气。天气仅作为参考信息，不由应用层写死路线排序。",
            toolCalls: [
              {
                id: "mock-read-settings",
                name: "read_settings",
                arguments: {},
              },
              {
                id: "mock-read-memories",
                name: "read_memories",
                arguments: {},
              },
              {
                id: "mock-search-poi",
                name: "search_poi",
                arguments: { keywords: destination.name, city: "宁波" },
              },
              {
                id: "mock-weather",
                name: "get_weather_reference",
                arguments: { city: "宁波" },
              },
            ],
          },
        };
      }

      const settingsMessage = toolMessages.find(
        (message) => message.toolCallId === "mock-read-settings"
      );
      const settings = settingsMessage
        ? (JSON.parse(settingsMessage.content) as Record<string, unknown>)
        : {};
      const originName =
        typeof settings.originName === "string" ? settings.originName : "";
      const originLngLat =
        typeof settings.originLngLat === "string"
          ? settings.originLngLat
          : "";
      const routeTitle = originName
        ? `公交/地铁路线：${originName} 到 宁波龙湖天街`
        : "公交/地铁路线：前往宁波龙湖天街";

      const travelMode = getFallbackTravelMode(messages);
      const routeMinutes = getFallbackRouteMinutes(travelMode);
      const bufferMinutes = getFallbackBufferMinutes(travelMode);
      const totalMinutes = routeMinutes + bufferMinutes;
      const fallbackRouteTitle = getFallbackRouteTitle(
        travelMode,
        destination.name
      );
      const fallbackRouteRationale = getFallbackRouteRationale(travelMode);

      const targetArriveAts = extractFallbackTargetArriveAts(messages);
      const explicitTargetArriveAt = targetArriveAts.at(-1);
      const relativeDeltaMinutes =
        getFallbackRelativeArrivalDeltaMinutes(messages);
      const contextTargetArriveAt =
        extractFallbackCurrentTripTargetArriveAt(toolMessages) ??
        extractFallbackContextTargetArriveAt(messages);
      const targetArriveAt =
        explicitTargetArriveAt ??
        (relativeDeltaMinutes === undefined
          ? undefined
          : offsetFallbackIso(contextTargetArriveAt, relativeDeltaMinutes));
      const firstStopArriveAt = targetArriveAts[0] ?? targetArriveAt;
      const isSchoolOfficeTrip = isFallbackSchoolOfficePrompt(messages);
      const isCoffeeLonghuTrip = isFallbackCoffeeLonghuPrompt(messages);

      if (isTravelSession) {
        const drivingCallId = "mock-travel-driving";
        const transitCallId = "mock-travel-transit";
        const routeToolCalls = [];

        if (!toolMessages.some((message) => message.toolCallId === drivingCallId)) {
          routeToolCalls.push({
            id: drivingCallId,
            name: "get_driving_route",
            arguments: {
              origin: originLngLat,
              destination: destination.lngLat,
              city: "宁波",
              cityd: "宁波",
            },
          });
        }

        if (!toolMessages.some((message) => message.toolCallId === transitCallId)) {
          routeToolCalls.push({
            id: transitCallId,
            name: "get_transit_route",
            arguments: {
              origin: originLngLat,
              destination: destination.lngLat,
              city: "宁波",
              cityd: "宁波",
            },
          });
        }

        if (routeToolCalls.length > 0) {
          return {
            message: {
              role: "assistant",
              content: "mock agent 对比自驾和公共交通路线。",
              toolCalls: routeToolCalls,
            },
          };
        }

        const drivingMinutes = readFallbackRouteDuration(
          toolMessages,
          drivingCallId,
          36
        );
        const transitMinutes = readFallbackRouteDuration(
          toolMessages,
          transitCallId,
          42
        );
        const travelPlan = buildFallbackTravelPlan({
          destination,
          weatherSummary:
            typeof readFallbackToolPayload(toolMessages, "mock-weather").summary ===
            "string"
              ? String(readFallbackToolPayload(toolMessages, "mock-weather").summary)
              : "宁波天气暂无更多信息，仅作参考。",
          drivingMinutes,
          drivingSummary: readFallbackRouteSummary(
            toolMessages,
            drivingCallId,
            "驾车路线来自本地演示数据"
          ),
          transitMinutes,
          transitSummary: readFallbackRouteSummary(
            toolMessages,
            transitCallId,
            "公交/地铁路线来自本地演示数据"
          ),
        });
        const recommendedOption =
          travelPlan.transport.recommended === "driving"
            ? travelPlan.transport.driving
            : travelPlan.transport.transit;
        const routeMinutes = recommendedOption.durationMinutes ?? transitMinutes;
        const bufferMinutes = 15;
        const routeInput = {
          order: 1,
          originName,
          originLngLat,
          destinationName: destination.name,
          destinationLngLat: destination.lngLat,
          targetArriveAt,
          routeMinutes,
          bufferMinutes,
          totalMinutes: routeMinutes + bufferMinutes,
          mode: travelPlan.transport.recommended,
          routeTitle: recommendedOption.route,
          routeRationale: travelPlan.transport.reason,
          segmentTitle: `${travelPlan.transport.recommended === "driving" ? "自驾" : "公共交通"}前往${destination.name}`,
          segmentDetail: "mock agent 根据天气和两种路线证据生成旅行演示行程。",
          segmentSource: "amap",
          source: { source: "mock-agent" },
          bufferComponents: [
            {
              category: "venue",
              label: "到场缓冲",
              minutes: 5,
              reason: "预留景区入口、停车或进站后的步行时间。",
              source: "agent_inference",
            },
            {
              category: "transfer",
              label: "换乘/停车缓冲",
              minutes: 10,
              reason: "预留换乘、停车和行李整理等旅行摩擦。",
              source: "agent_inference",
            },
            {
              category: "weather_context",
              label: "天气参考",
              minutes: 0,
              reason: "天气仅作为参考，出发前重新确认。",
              source: "weather_context",
            },
          ],
        };
        const toolName = currentTripId ? "replace_trip_legs" : "create_trip";

        return {
          message: {
            role: "assistant",
            content: currentTripId
              ? "mock agent 更新旅行演示行程。"
              : "mock agent 创建旅行演示行程。",
            toolCalls: [
              {
                id: currentTripId ? "mock-replace-trip" : "mock-create-trip",
                name: toolName,
                arguments: currentTripId
                  ? {
                      tripId: currentTripId,
                      title: destination.name,
                      targetArriveAt,
                      finalStopName: destination.name,
                      stops: [
                        {
                          order: 1,
                          name: destination.name,
                          address: destination.address,
                          lngLat: destination.lngLat,
                          targetArriveAt,
                          kind: "destination",
                          notes: "第 1 天至第 2 天旅行规划目的地。",
                        },
                      ],
                      legs: [routeInput],
                      travelPlan,
                    }
                  : {
                      title: destination.name,
                      timezone: "Asia/Shanghai",
                      targetArriveAt,
                      finalStopName: destination.name,
                      stops: [
                        {
                          order: 1,
                          name: destination.name,
                          address: destination.address,
                          lngLat: destination.lngLat,
                          targetArriveAt,
                          kind: "destination",
                          notes: "第 1 天至第 2 天旅行规划目的地。",
                        },
                      ],
                      legs: [routeInput],
                      travelPlan,
                    },
              },
            ],
          },
        };
      }

      if (!toolMessages.some((message) => message.toolCallId === "mock-route")) {
        return {
          message: {
            role: "assistant",
            content: "mock agent 查询高德路线候选。",
            toolCalls: [
              {
                id: "mock-route",
                name: getFallbackRouteToolName(travelMode),
                arguments: {
                  origin: originLngLat,
                  destination: destination.lngLat,
                  city: "宁波",
                  cityd: "宁波",
                },
              },
            ],
          },
        };
      }

      if (
        toolMessages.some((message) =>
          ["mock-create-trip", "mock-replace-trip"].includes(
            message.toolCallId ?? ""
          )
        )
      ) {
        return {
          message: {
            role: "assistant",
            content: "mock agent 已完成本地演示行程更新。",
          },
        };
      }

      if (isSchoolOfficeTrip) {
        return {
          message: {
            role: "assistant",
            content: "mock agent 创建多段本地演示行程。",
            toolCalls: [
              {
                id: "mock-create-trip",
                name: "create_trip",
                arguments: {
                  title: "E2E Origin-Foreign Affairs School-Office",
                  timezone: "Asia/Shanghai",
                  targetArriveAt,
                  finalStopName: "Office",
                  stops: [
                    {
                      order: 1,
                      name: "Foreign Affairs School",
                      address: "Foreign Affairs School",
                      lngLat: "121.560,29.860",
                      targetArriveAt: firstStopArriveAt,
                      plannedStayMin: 10,
                      kind: "stopover",
                    },
                    {
                      order: 2,
                      name: "Office",
                      address: "Office",
                      lngLat: "121.600,29.880",
                      targetArriveAt,
                      kind: "destination",
                    },
                  ],
                  legs: [
                    {
                      order: 1,
                      originName,
                      originLngLat,
                      destinationName: "Foreign Affairs School",
                      destinationLngLat: "121.560,29.860",
                      targetArriveAt: firstStopArriveAt,
                      routeMinutes: 24,
                      bufferMinutes: 8,
                      totalMinutes: 32,
                      mode: "transit",
                      routeTitle: "E2E Origin to Foreign Affairs School",
                      routeRationale:
                        "mock agent plans the first school drop-off leg before the final office commute.",
                      segmentTitle: "Transit to Foreign Affairs School",
                      segmentDetail:
                        "mock agent generated the first leg from the configured origin to school.",
                      segmentSource: "amap",
                      source: { source: "mock-agent" },
                      bufferComponents: [
                        {
                          category: "transfer",
                          label: "School arrival buffer",
                          minutes: 5,
                          reason: "Reserve time to enter the school area.",
                          source: "agent_inference",
                        },
                        {
                          category: "venue",
                          label: "Drop-off buffer",
                          minutes: 3,
                          reason: "Reserve time for the stopover handoff.",
                          source: "agent_inference",
                        },
                      ],
                    },
                    {
                      order: 2,
                      originName: "Foreign Affairs School",
                      originLngLat: "121.560,29.860",
                      destinationName: "Office",
                      destinationLngLat: "121.600,29.880",
                      targetArriveAt,
                      routeMinutes: 30,
                      bufferMinutes: 10,
                      totalMinutes: 40,
                      mode: "transit",
                      routeTitle: "Foreign Affairs School to Office",
                      routeRationale:
                        "mock agent plans the second leg after the 10 minute school stopover.",
                      segmentTitle: "Transit to Office",
                      segmentDetail:
                        "mock agent generated the second leg from school to office.",
                      segmentSource: "amap",
                      source: { source: "mock-agent" },
                      bufferComponents: [
                        {
                          category: "transfer",
                          label: "Transfer buffer",
                          minutes: 5,
                          reason: "Reserve time for platform and walking friction.",
                          source: "agent_inference",
                        },
                        {
                          category: "venue",
                          label: "Office arrival buffer",
                          minutes: 5,
                          reason: "Reserve time to enter the workplace.",
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
      }

      if (isCoffeeLonghuTrip) {
        return {
          message: {
            role: "assistant",
            content: "mock agent 创建带停靠点的本地演示行程。",
            toolCalls: [
              {
                id: "mock-create-trip",
                name: "create_trip",
                arguments: {
                  title: "E2E Origin-Coffee Shop Near Station-Longhu Tianjie",
                  timezone: "Asia/Shanghai",
                  targetArriveAt,
                  finalStopName: "Longhu Tianjie",
                  stops: [
                    {
                      order: 1,
                      name: "Coffee Shop Near Station",
                      address: "Coffee Shop Near Station",
                      lngLat: "121.550,29.865",
                      targetArriveAt: firstStopArriveAt,
                      plannedStayMin: 8,
                      kind: "stopover",
                    },
                    {
                      order: 2,
                      name: "Longhu Tianjie",
                      address: "Longhu Tianjie",
                      lngLat: "121.616,29.868",
                      targetArriveAt,
                      kind: "destination",
                    },
                  ],
                  legs: [
                    {
                      order: 1,
                      originName,
                      originLngLat,
                      destinationName: "Coffee Shop Near Station",
                      destinationLngLat: "121.550,29.865",
                      targetArriveAt: firstStopArriveAt,
                      routeMinutes: 18,
                      bufferMinutes: 7,
                      totalMinutes: 25,
                      mode: "transit",
                      routeTitle: "E2E Origin to Coffee Shop Near Station",
                      routeRationale:
                        "mock agent plans the errand stop before continuing to Longhu Tianjie.",
                      segmentTitle: "Transit to Coffee Shop Near Station",
                      segmentDetail:
                        "mock agent generated the first leg from origin to the coffee stop.",
                      segmentSource: "amap",
                      source: { source: "mock-agent" },
                      bufferComponents: [
                        {
                          category: "transfer",
                          label: "Coffee stop approach buffer",
                          minutes: 4,
                          reason: "Reserve time to reach the shop from transit.",
                          source: "agent_inference",
                        },
                        {
                          category: "venue",
                          label: "Ordering buffer",
                          minutes: 3,
                          reason: "Reserve time for the coffee purchase.",
                          source: "agent_inference",
                        },
                      ],
                    },
                    {
                      order: 2,
                      originName: "Coffee Shop Near Station",
                      originLngLat: "121.550,29.865",
                      destinationName: "Longhu Tianjie",
                      destinationLngLat: "121.616,29.868",
                      targetArriveAt,
                      routeMinutes: 26,
                      bufferMinutes: 10,
                      totalMinutes: 36,
                      mode: "transit",
                      routeTitle: "Coffee Shop Near Station to Longhu Tianjie",
                      routeRationale:
                        "mock agent continues from the 8 minute errand stop to the final destination.",
                      segmentTitle: "Transit to Longhu Tianjie",
                      segmentDetail:
                        "mock agent generated the second leg from the coffee stop to Longhu Tianjie.",
                      segmentSource: "amap",
                      source: { source: "mock-agent" },
                      bufferComponents: [
                        {
                          category: "transfer",
                          label: "Transfer buffer",
                          minutes: Math.max(0, bufferMinutes - 5),
                          reason: "Reserve time for transit and walking friction.",
                          source: "agent_inference",
                        },
                        {
                          category: "venue",
                          label: "Arrival buffer",
                          minutes: 5,
                          reason: "Reserve time to enter Longhu Tianjie.",
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
      }

      if (currentTripId && isFallbackAddStopPrompt(messages)) {
        const stayMinutes = getFallbackStopStayMinutes(messages, 5);
        const coffeeStopArriveAt =
          offsetFallbackIso(targetArriveAt, -(36 + stayMinutes)) ??
          targetArriveAt;

        return {
          message: {
            role: "assistant",
            content: "mock agent adds a coffee stop to the current local demo trip.",
            toolCalls: [
              {
                id: "mock-replace-trip",
                name: "replace_trip_legs",
                arguments: {
                  tripId: currentTripId,
                  title: "E2E Origin-Coffee Shop Near Station-Longhu Tianjie",
                  targetArriveAt,
                  finalStopName: "Longhu Tianjie",
                  stops: [
                    {
                      order: 1,
                      name: "Coffee Shop Near Station",
                      address: "Coffee Shop Near Station",
                      lngLat: "121.550,29.865",
                      targetArriveAt: coffeeStopArriveAt,
                      plannedStayMin: stayMinutes,
                      kind: "stopover",
                    },
                    {
                      order: 2,
                      name: "Longhu Tianjie",
                      address: "Longhu Tianjie",
                      lngLat: "121.616,29.868",
                      targetArriveAt,
                      kind: "destination",
                    },
                  ],
                  legs: [
                    {
                      order: 1,
                      originName,
                      originLngLat,
                      destinationName: "Coffee Shop Near Station",
                      destinationLngLat: "121.550,29.865",
                      targetArriveAt: coffeeStopArriveAt,
                      routeMinutes: 18,
                      bufferMinutes: 7,
                      totalMinutes: 25,
                      mode: "transit",
                      routeTitle: "E2E Origin to Coffee Shop Near Station",
                      routeRationale:
                        "mock agent adds the requested coffee stop before continuing to Longhu Tianjie.",
                      segmentTitle: "Transit to Coffee Shop Near Station",
                      segmentDetail:
                        "mock agent generated the first leg from origin to the coffee stop.",
                      segmentSource: "amap",
                      source: { source: "mock-agent" },
                      bufferComponents: [
                        {
                          category: "transfer",
                          label: "Coffee stop approach buffer",
                          minutes: 4,
                          reason: "Reserve time to reach the shop from transit.",
                          source: "agent_inference",
                        },
                        {
                          category: "venue",
                          label: "Ordering buffer",
                          minutes: 3,
                          reason: "Reserve time for the coffee purchase.",
                          source: "agent_inference",
                        },
                      ],
                    },
                    {
                      order: 2,
                      originName: "Coffee Shop Near Station",
                      originLngLat: "121.550,29.865",
                      destinationName: "Longhu Tianjie",
                      destinationLngLat: "121.616,29.868",
                      targetArriveAt,
                      routeMinutes: 26,
                      bufferMinutes: 10,
                      totalMinutes: 36,
                      mode: "transit",
                      routeTitle: "Coffee Shop Near Station to Longhu Tianjie",
                      routeRationale:
                        "mock agent continues from the requested coffee stop to the final destination.",
                      segmentTitle: "Transit to Longhu Tianjie",
                      segmentDetail:
                        "mock agent generated the second leg from the coffee stop to Longhu Tianjie.",
                      segmentSource: "amap",
                      source: { source: "mock-agent" },
                      bufferComponents: [
                        {
                          category: "transfer",
                          label: "Transfer buffer",
                          minutes: Math.max(0, bufferMinutes - 5),
                          reason: "Reserve time for transit and walking friction.",
                          source: "agent_inference",
                        },
                        {
                          category: "venue",
                          label: "Arrival buffer",
                          minutes: 5,
                          reason: "Reserve time to enter Longhu Tianjie.",
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
      }

      if (currentTripId) {
        return {
          message: {
            role: "assistant",
            content: "mock agent updates the current local demo trip.",
            toolCalls: [
              {
                id: "mock-replace-trip",
                name: "replace_trip_legs",
                arguments: {
                  tripId: currentTripId,
                  title: destination.name,
                  targetArriveAt,
                  finalStopName: destination.name,
                  stops: [
                    {
                      order: 1,
                      name: destination.name,
                      address: destination.address,
                      lngLat: destination.lngLat,
                      targetArriveAt,
                      kind: "destination",
                    },
                  ],
                  legs: [
                    {
                      order: 1,
                      originName,
                      originLngLat,
                      destinationName: destination.name,
                      destinationLngLat: destination.lngLat,
                      targetArriveAt,
                      routeMinutes,
                      bufferMinutes,
                      totalMinutes,
                      mode: travelMode,
                      routeTitle: fallbackRouteTitle,
                      routeRationale: fallbackRouteRationale,
                      segmentTitle: fallbackRouteTitle,
                      segmentDetail:
                        "mock agent replaced the current route instead of creating a duplicate trip.",
                      segmentSource: "amap",
                      source: { source: "mock-agent" },
                      bufferComponents: [
                        {
                          category: "venue",
                          label: "Arrival buffer",
                          minutes: 5,
                          reason: "Reserve time to enter Longhu Tianjie.",
                          source: "agent_inference",
                        },
                        {
                          category: "transfer",
                          label: "Transfer buffer",
                          minutes: 5,
                          reason: "Reserve time for transit and walking friction.",
                          source: "agent_inference",
                        },
                        {
                          category: "weather_context",
                          label: "Weather reference",
                          minutes: 0,
                          reason:
                            "Weather is reference context for this deterministic fallback route.",
                          source: "weather_context",
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        };
      }

      return {
        message: {
          role: "assistant",
          content: "mock agent 创建本地演示行程。",
          toolCalls: [
            {
              id: "mock-create-trip",
              name: "create_trip",
              arguments: {
                title: "宁波龙湖天街",
                timezone: "Asia/Shanghai",
                targetArriveAt,
                finalStopName: "宁波龙湖天街",
                stops: [
                  {
                    order: 1,
                    name: "宁波龙湖天街",
                    address: "浙江省宁波市龙湖天街",
                    lngLat: "121.616,29.868",
                    targetArriveAt,
                    kind: "destination",
                  },
                ],
                legs: [
                  {
                    order: 1,
                    originName,
                    originLngLat,
                    destinationName: "宁波龙湖天街",
                    destinationLngLat: "121.616,29.868",
                    targetArriveAt,
                    routeMinutes: 42,
                    bufferMinutes: 10,
                    totalMinutes: 52,
                    mode: "transit",
                    routeTitle,
                    routeRationale:
                      "mock agent 根据高德路线和天气证据选择公交/地铁作为本地演示方案。",
                    segmentTitle: "公交/地铁到龙湖天街",
                    segmentDetail: "mock agent 通过工具调用生成，非固定 planner 排序。",
                    segmentSource: "amap",
                    source: { source: "mock-agent" },
                    bufferComponents: [
                      {
                        category: "venue",
                        label: "到场缓冲",
                        minutes: 5,
                        reason: "mock agent 预留进入商场和找位置时间。",
                        source: "agent_inference",
                      },
                      {
                        category: "transfer",
                        label: "换乘缓冲",
                        minutes: 5,
                        reason: "mock agent 预留站台、接驳和步行摩擦。",
                        source: "agent_inference",
                      },
                      {
                        category: "weather_context",
                        label: "天气参考",
                        minutes: 0,
                        reason: "当前 mock 天气温和，暂不额外增加天气缓冲。",
                        source: "weather_context",
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
