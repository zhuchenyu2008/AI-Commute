import { createAmapClient } from "@/lib/amap";
import type { AmapClient } from "@/lib/amap";
import { prisma } from "@/lib/db";
import { readEnv } from "@/lib/env";
import type {
  AgentChatClient,
  AgentChatMessage,
  AgentChatToolCall,
  AgentChatToolDefinition,
} from "@/lib/agent/chat-client";
import {
  createOpenAiChatClient,
  TRAVEL_PLANNING_MODEL,
} from "@/lib/agent/chat-client";
import { assertAgentRunActive, recordToolCall } from "@/lib/agent/tools";
import { buildConfirmedMemoryContext } from "@/lib/memories/context";
import type {
  AgentToolName,
  ContinueAgentSessionInput,
  PlanningAttemptResult,
  PlanningSessionResult,
  StartPlanningSessionInput,
} from "@/lib/agent/types";
import {
  AgentRunTimeoutError,
  runWithTimeoutAndRetry,
} from "@/lib/agent/runner";
import { createPlannedTrip } from "@/lib/trips/create-trip";
import {
  cancelTripMonitoring,
  createMemoryCandidateForTrip,
  replaceReminderSchedule,
  replaceTripRoute,
  selectRouteCandidate,
  updateTripSummary,
} from "@/lib/trips/route-updates";
import type {
  BufferComponentInput,
  CreatePlannedTripInput,
  PlannedTripLegInput,
  PlannedTripStopInput,
} from "@/lib/trips/types";
import {
  assertTravelPlanAttractionCoverage,
  normalizeTravelPlan,
  parseTravelPlanJson,
} from "@/lib/trips/travel-plan";
import type { AgentPlanningPurpose } from "@/lib/agent/types";

const SESSION_TIMEOUT_MS = 600000;
const SESSION_MAX_ATTEMPTS = 2;
const ORIGIN_REQUIRED_MESSAGE =
  "请先在设置中选择默认出发点，或在本次请求中提供出发点。";
const LNG_LAT_PATTERN = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;
const NATURAL_ATTRACTION_SEARCH_GROUPS = [
  "山,峰,森林,森林公园,国家公园",
  "湖,湿地,溪流,瀑布,峡谷",
  "海,海岛,海滩,滨海,湾",
  "公园,植物园,观景台,风景区",
] as const;

export { AgentRunTimeoutError };

export class AgentSessionAlreadyRunningError extends Error {
  constructor() {
    super("Agent session is already running.");
    this.name = "AgentSessionAlreadyRunningError";
  }
}

export class AgentSessionNotFoundError extends Error {
  constructor() {
    super("Agent session not found.");
    this.name = "AgentSessionNotFoundError";
  }
}

type PlanningSettings = {
  defaultCity: string;
  timezone: string;
  model: string;
  originName: string;
  originLngLat: string;
  routePreference: string;
};

export type RunPlanningSessionOptions = {
  chatClient?: AgentChatClient;
  amapClient?: AmapClient;
};

type ToolExecutionContext = {
  amap: AmapClient;
  sessionId: string;
  userId: string;
  prompt: string;
  purpose: AgentPlanningPurpose;
  tripId?: string | null;
  signal?: AbortSignal;
};

const fallbackSettings = (): PlanningSettings => {
  const env = readEnv();
  return {
    defaultCity: env.defaultCity,
    timezone: env.defaultTimezone,
    model: env.openAiModel,
    originName: "",
    originLngLat: "",
    routePreference: "balanced",
  };
};

function normalizePlanningSettings(settings: {
  defaultCity: string;
  timezone: string;
  model: string | null;
  originName: string | null;
  originLngLat: string | null;
  routePreference: string;
}): PlanningSettings {
  return {
    defaultCity: settings.defaultCity,
    timezone: settings.timezone,
    model: settings.model ?? fallbackSettings().model,
    originName: settings.originName ?? "",
    originLngLat: settings.originLngLat ?? "",
    routePreference: settings.routePreference,
  };
}

function normalizePrompt(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("请输入通勤规划需求。");
  }

  return trimmed;
}

export function formatPlanningFailureMessage(error: unknown) {
  if (error instanceof AgentRunTimeoutError) {
    return "规划失败：智能体规划超时，请稍后重试。";
  }

  if (error instanceof Error) {
    const knownMessages: Record<string, string> = {
      "Agent run aborted.": "规划失败：智能体运行已中止。",
      "timeoutMs must be greater than zero.":
        "规划失败：内部运行超时配置无效。",
      "maxAttempts must be greater than zero.":
        "规划失败：内部重试配置无效。",
      "Agent planning failed after all attempts.":
        "规划失败：多次尝试后仍未完成，请稍后重试。",
    };

    return knownMessages[error.message] ?? `规划失败：${error.message}`;
  }

  return "规划失败：请稍后重试。";
}

async function createAssistantMessage(input: {
  sessionId: string;
  content: string;
  metadata?: unknown;
  signal?: AbortSignal;
}) {
  assertAgentRunActive(input.signal);
  const message = await prisma.agentMessage.create({
    data: {
      agentSessionId: input.sessionId,
      role: "assistant",
      content: input.content,
      metadataJson:
        input.metadata === undefined ? undefined : JSON.stringify(input.metadata),
    },
  });
  assertAgentRunActive(input.signal);
  return message;
}

function objectParameters(
  properties: Record<string, unknown>,
  required: string[] = []
) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function arrayOfItems(items: Record<string, unknown>) {
  return {
    type: "array",
    items,
  };
}

const bufferComponentSchema = objectParameters(
  {
    category: { type: "string" },
    label: { type: "string" },
    minutes: { type: "number" },
    reason: { type: "string" },
    source: {
      type: "string",
      enum: [
        "agent_inference",
        "user_setting",
        "memory",
        "weather_context",
        "manual_override",
      ],
    },
  },
  ["category", "label", "minutes", "reason"]
);

const stopSchema = objectParameters(
  {
    order: { type: "number" },
    name: { type: "string" },
    address: { type: "string" },
    lngLat: { type: "string" },
    targetArriveAt: { type: "string" },
    plannedStayMin: { type: "number" },
    kind: { type: "string" },
    notes: { type: "string" },
  },
  ["name"]
);

const legSchema = objectParameters(
  {
    order: { type: "number" },
    originName: { type: "string" },
    originLngLat: { type: "string" },
    destinationName: { type: "string" },
    destinationLngLat: { type: "string" },
    routeMinutes: { type: "number" },
    bufferMinutes: { type: "number" },
    totalMinutes: { type: "number" },
    bufferComponents: arrayOfItems(bufferComponentSchema),
    latestDepartAt: { type: "string" },
    targetArriveAt: { type: "string" },
    mode: { type: "string" },
    routeTitle: { type: "string" },
    routeRationale: { type: "string" },
    segmentTitle: { type: "string" },
    segmentDetail: { type: "string" },
    segmentSource: { type: "string" },
    source: { type: "object" },
  },
  [
    "originName",
    "originLngLat",
    "destinationName",
    "routeMinutes",
    "bufferComponents",
  ]
);

const travelWeatherForecastSchema = objectParameters(
  {
    date: { type: "string" },
    day: { type: "number" },
    location: { type: "string" },
    summary: { type: "string" },
    risk: { type: "string", enum: ["low", "medium", "high"] },
    drivingAdvice: { type: "string" },
    outdoorAdvice: { type: "string" },
  },
  ["summary"]
);

const travelWeatherRouteRiskSchema = objectParameters(
  {
    legOrder: { type: "number" },
    day: { type: "number" },
    date: { type: "string" },
    route: { type: "string" },
    summary: { type: "string" },
    risk: { type: "string", enum: ["low", "medium", "high"] },
    drivingAdvice: { type: "string" },
    action: { type: "string" },
  },
  ["route", "summary", "drivingAdvice"]
);

const travelWeatherSchema = objectParameters(
  {
    city: { type: "string" },
    summary: { type: "string" },
    advice: { type: "string" },
    source: { type: "string" },
    observedAt: { type: "string" },
    dynamicMonitoring: { type: "boolean" },
    refreshPolicy: { type: "string" },
    forecast: arrayOfItems(travelWeatherForecastSchema),
    routeRisks: arrayOfItems(travelWeatherRouteRiskSchema),
  },
  ["city", "summary", "advice"]
);

const travelTransportOptionSchema = objectParameters(
  {
    summary: { type: "string" },
    reason: { type: "string" },
    durationMinutes: { type: "number" },
    route: { type: "string" },
  },
  ["summary", "reason"]
);

const travelTransportSchema = objectParameters(
  {
    recommended: {
      type: "string",
      enum: ["driving", "transit", "mixed"],
    },
    reason: { type: "string" },
    driving: travelTransportOptionSchema,
    transit: travelTransportOptionSchema,
    localMovement: { type: "string" },
  },
  ["recommended", "reason", "driving", "transit"]
);

const travelAttractionSchema = objectParameters(
  {
    name: { type: "string" },
    category: { type: "string", enum: ["natural", "cultural"] },
    reason: { type: "string" },
    address: { type: "string" },
    lngLat: { type: "string" },
    day: { type: "number" },
    stayMinutes: { type: "number" },
    bestTime: { type: "string" },
    weatherNote: { type: "string" },
    notes: { type: "string" },
  },
  ["name", "category", "reason"]
);

const travelLodgingSchema = objectParameters(
  {
    name: { type: "string" },
    area: { type: "string" },
    reason: { type: "string" },
    budget: { type: "string" },
    notes: { type: "string" },
  },
  ["name", "area", "reason"]
);

const travelFoodSchema = objectParameters(
  {
    name: { type: "string" },
    area: { type: "string" },
    mustTry: { type: "string" },
    reason: { type: "string" },
    budget: { type: "string" },
    notes: { type: "string" },
  },
  ["name", "mustTry", "reason"]
);

const travelPitfallSchema = objectParameters(
  {
    title: { type: "string" },
    detail: { type: "string" },
    severity: { type: "string", enum: ["high", "medium", "low"] },
  },
  ["title", "detail"]
);

const travelPlanSchema = objectParameters(
  {
    destination: { type: "string" },
    summary: { type: "string" },
    days: { type: "number" },
    weather: travelWeatherSchema,
    transport: travelTransportSchema,
    attractions: arrayOfItems(travelAttractionSchema),
    lodging: arrayOfItems(travelLodgingSchema),
    food: arrayOfItems(travelFoodSchema),
    pitfalls: arrayOfItems(travelPitfallSchema),
  },
  [
    "destination",
    "summary",
    "weather",
    "transport",
    "attractions",
    "lodging",
    "food",
    "pitfalls",
  ]
);

const TOOL_DEFINITIONS: AgentChatToolDefinition[] = [
  {
    name: "read_settings",
    description:
      "Read the user's city, timezone, selected planning model, default origin, and route preference.",
    parameters: objectParameters({}),
  },
  {
    name: "read_memories",
    description: "Read confirmed commute memories and preferences.",
    parameters: objectParameters({}),
  },
  {
    name: "search_poi",
    description: "Search AMap POIs by keyword.",
    parameters: objectParameters(
      {
        keywords: { type: "string" },
        city: { type: "string" },
      },
      ["keywords"]
    ),
  },
  {
    name: "search_natural_attractions",
    description:
      "Search and deduplicate a broad set of natural-attraction candidates in one call. The application searches mountain, lake, forest, wetland, coast, canyon, waterfall, park, and viewpoint keywords. Use this before choosing natural attractions; return at least three distinct candidates when the destination has enough options.",
    parameters: objectParameters(
      {
        city: { type: "string" },
        limit: { type: "number" },
      },
      []
    ),
  },
  {
    name: "get_poi_detail",
    description: "Read AMap POI details.",
    parameters: objectParameters({ id: { type: "string" } }, ["id"]),
  },
  {
    name: "get_weather_reference",
    description:
      "Read live weather plus the available multi-day forecast from AMap. Use the forecast for each itinerary day and route segment; call it again during route rechecks because weather is dynamic evidence, not a static label.",
    parameters: objectParameters({ city: { type: "string" } }, ["city"]),
  },
  {
    name: "get_transit_route",
    description:
      "Query AMap transit route. origin and destination must be lng,lat coordinates; use search_poi to resolve place names first.",
    parameters: objectParameters(
      {
        origin: { type: "string" },
        destination: { type: "string" },
        city: { type: "string" },
        cityd: { type: "string" },
      },
      ["origin", "destination"]
    ),
  },
  {
    name: "get_driving_route",
    description:
      "Query AMap driving route for self-drive comparison. origin and destination must be lng,lat coordinates; use search_poi to resolve place names first.",
    parameters: objectParameters(
      {
        origin: { type: "string" },
        destination: { type: "string" },
        city: { type: "string" },
        cityd: { type: "string" },
      },
      ["origin", "destination"]
    ),
  },
  {
    name: "get_walking_route",
    description:
      "Query AMap walking route. origin and destination must be lng,lat coordinates; use search_poi to resolve place names first.",
    parameters: objectParameters(
      {
        origin: { type: "string" },
        destination: { type: "string" },
        city: { type: "string" },
        cityd: { type: "string" },
      },
      ["origin", "destination"]
    ),
  },
  {
    name: "get_bicycling_route",
    description:
      "Query AMap bicycling route. origin and destination must be lng,lat coordinates; use search_poi to resolve place names first.",
    parameters: objectParameters(
      {
        origin: { type: "string" },
        destination: { type: "string" },
        city: { type: "string" },
        cityd: { type: "string" },
      },
      ["origin", "destination"]
    ),
  },
  {
    name: "create_trip",
    description:
      "Create the final planned trip after the AI has gathered evidence and made a decision.",
    parameters: objectParameters(
      {
        title: { type: "string" },
        timezone: { type: "string" },
        targetArriveAt: { type: "string" },
        finalStopName: { type: "string" },
        stops: arrayOfItems(stopSchema),
        legs: arrayOfItems(legSchema),
        travelPlan: travelPlanSchema,
      },
      ["title", "timezone", "stops", "legs"]
    ),
  },
  {
    name: "read_current_trip",
    description:
      "Read the current trip with stops, legs, route candidates, buffers, segments, and reminders.",
    parameters: objectParameters({ tripId: { type: "string" } }),
  },
  {
    name: "update_trip_summary",
    description:
      "Update the current trip summary: title, final stop, target arrival, and status.",
    parameters: objectParameters({
      tripId: { type: "string" },
      title: { type: "string" },
      finalStopName: { type: "string" },
      targetArriveAt: { type: "string" },
      status: { type: "string" },
      travelPlan: travelPlanSchema,
    }),
  },
  {
    name: "replace_trip_stops",
    description:
      "Replace trip stops. Provide legs too to rebuild the complete route transactionally.",
    parameters: objectParameters({
      tripId: { type: "string" },
      title: { type: "string" },
      finalStopName: { type: "string" },
      targetArriveAt: { type: "string" },
      stops: arrayOfItems(stopSchema),
      legs: arrayOfItems(legSchema),
      travelPlan: travelPlanSchema,
    }),
  },
  {
    name: "replace_trip_legs",
    description:
      "Replace trip legs. Provide stops too to rebuild the complete route transactionally.",
    parameters: objectParameters({
      tripId: { type: "string" },
      title: { type: "string" },
      finalStopName: { type: "string" },
      targetArriveAt: { type: "string" },
      stops: arrayOfItems(stopSchema),
      legs: arrayOfItems(legSchema),
      travelPlan: travelPlanSchema,
    }),
  },
  {
    name: "select_route_candidate",
    description: "Select an existing route candidate for a trip leg.",
    parameters: objectParameters({
      tripId: { type: "string" },
      legId: { type: "string" },
      legOrder: { type: "number" },
      candidateId: { type: "string" },
      candidateKey: { type: "string" },
    }),
  },
  {
    name: "replace_reminder_schedule",
    description: "Regenerate reminder jobs from the current latest departure times.",
    parameters: objectParameters({
      tripId: { type: "string" },
      legId: { type: "string" },
      legOrder: { type: "number" },
      cadenceMinutes: arrayOfItems({ type: "number" }),
    }),
  },
  {
    name: "cancel_trip_monitoring",
    description: "Cancel monitoring for the current trip and scheduled reminders.",
    parameters: objectParameters({ tripId: { type: "string" } }),
  },
  {
    name: "create_memory_candidate",
    description: "Create a pending memory candidate for user confirmation.",
    parameters: objectParameters(
      {
        tripId: { type: "string" },
        kind: { type: "string" },
        label: { type: "string" },
        valueJson: {},
      },
      ["kind", "label", "valueJson"]
    ),
  },
];

const COMMUTE_SYSTEM_PROMPT = `You are a personal commute-planning AI. Current dates should be interpreted in Beijing time.
You must plan, calculate, compare, and decide yourself. The app only exposes tools; it will not hard-code route ranking, destination extraction, or buffer minutes for you.
Available tools include user settings, memories, all AMap POI/weather/transit/driving/walking/bicycling tools, create_trip, and current-route update tools. You may call tools for as many rounds as needed before timeout. Weather, route results, user preferences, and memories are evidence for your decision, not fixed app rules.
Before calling get_transit_route, get_driving_route, get_walking_route, or get_bicycling_route, provide origin and destination as lng,lat coordinates. Never pass place names directly; call search_poi first and use a returned lngLat value.
When the user does not explicitly say where to start, use the default origin from read_settings. When the user says they are starting from "我现在的位置", "当前位置", or similar, use the current-location context if it is provided.
You should actively adapt to weather evidence. In 恶劣天气 such as heavy rain, storms, extreme heat, strong wind, or snow, compare options with less exposed walking or bicycling when possible. If you still choose 长距离步行 or bicycling in bad weather, explain why it remains acceptable, and reflect the weather impact in route rationale and bufferComponents with meaningful minutes when extra time is needed.
Actively capture stable user preferences. When the user says phrases such as 我习惯, 我偏好, 我不喜欢, 以后都, 通常, or similar durable commute habits, call create_memory_candidate with a concise label and structured valueJson so the user can confirm it later.
Final user-facing replies must be plain text without Markdown formatting, headings, code ticks, or list markers.`;

const TRAVEL_SYSTEM_PROMPT = `You are a personal travel-itinerary planning AI. Current dates should be interpreted in Beijing time.
Plan a practical, evidence-aware trip rather than a generic list of attractions. Parse the destination, dates, number of days, origin, budget, pace, party, and constraints from the user's request. Ask for missing value-critical details only when the request cannot be safely planned; otherwise make a reasonable choice and state it in the result.
Use read_settings for the default city, timezone, and origin, and use the current-location context when the user says they are starting from their current position. Call get_weather_reference early: its result contains live weather and the available multi-day forecast. Weather is dynamic evidence, not a static label or guarantee. Map the forecast to each itinerary day, populate weather.forecast, and add weather.routeRisks for every meaningful self-drive leg with drivingAdvice and a concrete action. Set dynamicMonitoring to true and state a refreshPolicy such as rechecking before departure and at every scheduled route review. If the forecast horizon does not cover the trip, explicitly mark the later days as unknown and require a refresh before departure.
Self-driving is a time-varying process. Before calling get_transit_route, get_driving_route, get_walking_route, or get_bicycling_route, resolve both endpoints to lng,lat coordinates with search_poi. Compare self-drive and public transit whenever the route is meaningfully comparable. Use get_driving_route for self-drive and get_transit_route for public transit, then choose driving, transit, or mixed with a reason. Treat route duration and weather as snapshots: avoid claiming that a route is guaranteed, and make bad-weather actions explicit, such as postponing an exposed segment, switching to transit, adding indoor stops, or checking road and parking conditions again.
Natural scenery is a hard output requirement, not an optional extra. Call search_natural_attractions once before selecting attractions. It searches multiple nature categories for you. Recommend at least three distinct natural candidates for a one-to-three-day trip, at least four for a trip of four days or longer, and at least one cultural candidate. Cover different natural types when the destination supports them, such as mountain, lake, forest, wetland, coast, island, canyon, waterfall, park, or viewpoint. The application rejects a travel plan that has too few natural candidates, so do not stop after finding one scenic spot. Use the evidence returned by tools; do not invent venue-specific facts.
Search POIs before naming specific lodging or food venues. Explain the reason for every attraction, its best visiting time, suggested stay, and weather note. Search practical lodging areas and local food options. Add concrete pitfalls covering tickets/reservations, peak periods, parking or transit, weather, road conditions, and other destination-specific friction when relevant.
For a normal one-to-three-day request, keep evidence bounded but sufficient: make one initial weather call, one broad natural-attraction search, at most ten representative attraction or practical-place keyword searches plus one lodging and one food keyword, and call each main driving/transit comparison at most once. Once you have the weather forecast, at least three natural candidates, a cultural candidate, lodging, food, and both transport options, stop searching and immediately call create_trip. Do not search every possible option or repeat an equivalent route call.
The create_trip call is mandatory. In travel mode it must include a complete travelPlan object with destination, summary, weather including forecast and routeRisks, transport.driving, transport.transit, attractions, lodging, food, and pitfalls. Stops and legs must form a chronological itinerary; use stop notes for day/order context and route rationale for transport decisions. During a later route recheck, call get_weather_reference again before deciding. If weather, traffic, or road conditions change, update the route and pass the refreshed travelPlan to update_trip_summary or replace_trip_stops/replace_trip_legs so the visible plan stays consistent.
Final user-facing replies must be plain text without Markdown formatting, headings, code ticks, or list markers.`;

function getSystemPrompt(purpose: AgentPlanningPurpose) {
  return purpose === "travel" ? TRAVEL_SYSTEM_PROMPT : COMMUTE_SYSTEM_PROMPT;
}

function buildCurrentLocationContext(
  currentLocation: StartPlanningSessionInput["currentLocation"]
) {
  if (!currentLocation?.name || !currentLocation.lngLat) {
    return null;
  }

  return [
    "当前定位上下文：",
    `名称：${currentLocation.name}`,
    `坐标：${currentLocation.lngLat}`,
    currentLocation.city ? `城市：${currentLocation.city}` : null,
    "如果用户说从我现在的位置、当前位置或类似表达出发，请使用这个位置；如果用户没有说明出发点，请继续使用 read_settings 中的默认出发点。",
  ]
    .filter(Boolean)
    .join("\n");
}

async function createInitialMessages(
  session: {
    id: string;
    prompt: string;
    userId: string;
    purpose: string;
  },
  attempt: number
) {
  const memoryContext = await buildConfirmedMemoryContext(session.userId);
  const sessionContextMessages = await prisma.agentMessage.findMany({
    where: { agentSessionId: session.id, role: "system" },
    orderBy: { createdAt: "asc" },
  });
  const messages: AgentChatMessage[] = [
    {
      role: "system",
      content: getSystemPrompt(session.purpose === "travel" ? "travel" : "planning"),
    },
    { role: "system", content: memoryContext },
    ...sessionContextMessages.map((message) => ({
      role: "system" as const,
      content: message.content,
    })),
    {
      role: "user",
      content: `第 ${attempt} 次规划尝试：${session.prompt}`,
    },
  ];

  return messages;
}

async function createContinuationMessages(session: {
  id: string;
  prompt: string;
  userId: string;
  tripId: string | null;
  purpose: string;
}) {
  const memoryContext = await buildConfirmedMemoryContext(session.userId);
  const persistedMessages = await prisma.agentMessage.findMany({
    where: { agentSessionId: session.id },
    orderBy: { createdAt: "asc" },
  });

  const messages: AgentChatMessage[] = [
    {
      role: "system",
      content: getSystemPrompt(session.purpose === "travel" ? "travel" : "planning"),
    },
    { role: "system", content: memoryContext },
    {
      role: "system",
      content:
        "Continue the existing planning session. All planning and route update tools are available. You may call tools for as many rounds as needed until timeout. If a current trip exists, use route update tools to revise it instead of assuming the app will update it for you.",
    },
    {
      role: "system",
      content: `Original planning prompt: ${session.prompt}. Current trip id: ${
        session.tripId ?? "none"
      }.`,
    },
  ];

  for (const message of persistedMessages) {
    if (
      message.role === "system" ||
      message.role === "user" ||
      message.role === "assistant"
    ) {
      messages.push({
        role: message.role,
        content: message.content,
      });
    }
  }

  return messages;
}

function getToolName(name: string): AgentToolName {
  const allowed = new Set(
    TOOL_DEFINITIONS.map((tool) => tool.name as AgentToolName)
  );

  if (!allowed.has(name as AgentToolName)) {
    throw new Error(`Unknown agent tool: ${name}`);
  }

  return name as AgentToolName;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function readString(
  value: Record<string, unknown>,
  key: string,
  fallback?: string
) {
  const raw = value[key];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Missing string tool argument: ${key}`);
}

function readOptionalString(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function readOptionalNumber(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Tool argument ${key} must be a number.`);
  }

  return numeric;
}

function readNumber(value: Record<string, unknown>, key: string) {
  const numeric = readOptionalNumber(value, key);
  if (numeric === undefined) {
    throw new Error(`Missing number tool argument: ${key}`);
  }

  return numeric;
}

function readOptionalDate(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Tool argument ${key} is not a valid date.`);
  }

  return date;
}

function readArray(value: Record<string, unknown>, key: string): unknown[] {
  const raw = value[key];
  if (!Array.isArray(raw)) {
    throw new Error(`Tool argument ${key} must be an array.`);
  }

  return raw;
}

function readOptionalArray(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (!Array.isArray(raw)) {
    throw new Error(`Tool argument ${key} must be an array.`);
  }

  return raw;
}

function firstNonEmptyString(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim())
    ?.trim();
}

function normalizeLngLat(value: string) {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 2) {
    return null;
  }

  const normalized = parts.join(",");
  if (!LNG_LAT_PATTERN.test(normalized)) {
    return null;
  }

  const [lng, lat] = parts.map(Number);
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return null;
  }

  return normalized;
}

async function resolveRouteEndpoint(input: {
  value: string;
  label: "origin" | "destination";
  city: string;
  context: ToolExecutionContext;
}) {
  const coordinate = normalizeLngLat(input.value);
  if (coordinate) {
    return coordinate;
  }

  const request = {
    keywords: input.value,
    city: input.city,
  };
  const pois = await recordToolCall({
    agentSessionId: input.context.sessionId,
    name: "search_poi",
    request,
    signal: input.context.signal,
    run: () => input.context.amap.searchPoi(request),
  });
  const resolved = pois
    .map((poi) => normalizeLngLat(poi.lngLat))
    .find((lngLat): lngLat is string => Boolean(lngLat));

  if (!resolved) {
    throw new Error(
      `Unable to resolve route ${input.label} "${input.value}" to lng,lat coordinates.`
    );
  }

  return resolved;
}

function normalizeBufferComponent(value: unknown): BufferComponentInput {
  const component = requireObject(value, "bufferComponents[]");
  return {
    category: readString(component, "category"),
    label: readString(component, "label"),
    minutes: readNumber(component, "minutes"),
    reason: readString(component, "reason"),
    source: readOptionalString(component, "source") as
      | BufferComponentInput["source"]
      | undefined,
  };
}

function normalizeStop(value: unknown): PlannedTripStopInput {
  const stop = requireObject(value, "stops[]");
  return {
    order: readOptionalNumber(stop, "order"),
    name: readString(stop, "name"),
    address: readOptionalString(stop, "address"),
    lngLat: readOptionalString(stop, "lngLat"),
    targetArriveAt: readOptionalDate(stop, "targetArriveAt"),
    plannedStayMin: readOptionalNumber(stop, "plannedStayMin"),
    kind: readOptionalString(stop, "kind"),
    notes: readOptionalString(stop, "notes"),
  };
}

function normalizeLeg(value: unknown): PlannedTripLegInput {
  const leg = requireObject(value, "legs[]");
  return {
    order: readOptionalNumber(leg, "order"),
    originName: readOptionalString(leg, "originName"),
    originLngLat: readOptionalString(leg, "originLngLat"),
    destinationName: readOptionalString(leg, "destinationName"),
    destinationLngLat: readOptionalString(leg, "destinationLngLat"),
    routeMinutes: readNumber(leg, "routeMinutes"),
    bufferMinutes: readOptionalNumber(leg, "bufferMinutes"),
    totalMinutes: readOptionalNumber(leg, "totalMinutes"),
    bufferComponents: readArray(leg, "bufferComponents").map(
      normalizeBufferComponent
    ),
    latestDepartAt: readOptionalDate(leg, "latestDepartAt"),
    targetArriveAt: readOptionalDate(leg, "targetArriveAt"),
    mode: readOptionalString(leg, "mode"),
    routeTitle: readOptionalString(leg, "routeTitle"),
    routeRationale: readOptionalString(leg, "routeRationale"),
    segmentTitle: readOptionalString(leg, "segmentTitle"),
    segmentDetail: readOptionalString(leg, "segmentDetail"),
    segmentSource: readOptionalString(leg, "segmentSource"),
    source: leg.source,
  };
}

function normalizeCreateTripInput(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
  settings: PlanningSettings
): CreatePlannedTripInput {
  const travelPlan =
    args.travelPlan === undefined
      ? undefined
      : normalizeTravelPlan(args.travelPlan);

  if (context.purpose === "travel" && !travelPlan) {
    throw new Error("旅行规划必须提供结构化 travelPlan。");
  }

  if (context.purpose === "travel" && travelPlan) {
    assertTravelPlanAttractionCoverage(travelPlan);
  }

  return {
    userId: context.userId,
    agentSessionId: context.sessionId,
    rawPrompt: context.prompt,
    timezone: readString(args, "timezone", settings.timezone),
    title: readString(args, "title"),
    targetArriveAt: readOptionalDate(args, "targetArriveAt"),
    finalStopName: readOptionalString(args, "finalStopName"),
    stops: readArray(args, "stops").map(normalizeStop),
    legs: readArray(args, "legs").map(normalizeLeg),
    travelPlan,
  };
}

function readTripId(args: Record<string, unknown>, context: ToolExecutionContext) {
  const tripId = readOptionalString(args, "tripId") ?? context.tripId;
  if (!tripId) {
    throw new Error("The current session has no associated trip.");
  }

  return tripId;
}

async function readCurrentTrip(context: ToolExecutionContext, tripId: string) {
  return recordToolCall({
    agentSessionId: context.sessionId,
    name: "read_current_trip",
    request: { tripId },
    signal: context.signal,
    run: () =>
      prisma.trip.findFirstOrThrow({
        where: { id: tripId, userId: context.userId },
        include: {
          stops: { orderBy: { order: "asc" } },
          legs: {
            orderBy: { order: "asc" },
            include: {
              selectedCandidate: true,
              routeCandidates: { orderBy: { createdAt: "asc" } },
              routeSegments: { orderBy: { order: "asc" } },
              bufferComponents: { orderBy: { order: "asc" } },
              reminderJobs: { orderBy: { scheduledFor: "asc" } },
            },
          },
          reminderJobs: { orderBy: { scheduledFor: "asc" } },
        },
      }),
  });
}

async function loadCurrentRouteInputs(tripId: string, userId: string) {
  const trip = await prisma.trip.findFirstOrThrow({
    where: { id: tripId, userId },
    include: {
      stops: { orderBy: { order: "asc" } },
      legs: {
        orderBy: { order: "asc" },
        include: {
          selectedCandidate: true,
          bufferComponents: { orderBy: { order: "asc" } },
          routeSegments: { orderBy: { order: "asc" } },
        },
      },
    },
  });

  return {
    trip,
    stops: trip.stops.map((stop) => ({
      order: stop.order,
      name: stop.name,
      address: stop.address ?? undefined,
      lngLat: stop.lngLat ?? undefined,
      targetArriveAt: stop.targetArriveAt ?? undefined,
      plannedStayMin: stop.plannedStayMin ?? undefined,
      kind: stop.kind,
      notes: stop.notes ?? undefined,
    })),
    legs: trip.legs.map((leg) => ({
      order: leg.order,
      originName: leg.originName,
      originLngLat: leg.originLngLat,
      destinationName: leg.destinationName,
      destinationLngLat: leg.destinationLngLat ?? undefined,
      routeMinutes: leg.selectedCandidate?.routeMinutes ?? 30,
      bufferMinutes: leg.selectedCandidate?.bufferMinutes ?? undefined,
      totalMinutes: leg.selectedCandidate?.totalMinutes ?? undefined,
      latestDepartAt: leg.latestDepartAt ?? undefined,
      targetArriveAt: leg.targetArriveAt ?? undefined,
      mode: leg.selectedCandidate?.mode ?? undefined,
      routeTitle: leg.selectedCandidate?.title ?? undefined,
      routeRationale: leg.selectedCandidate?.rationale ?? undefined,
      segmentTitle: leg.routeSegments[0]?.title,
      segmentDetail: leg.routeSegments[0]?.detail ?? undefined,
      segmentSource: leg.routeSegments[0]?.source,
      bufferComponents: leg.bufferComponents.map((component) => ({
        category: component.category,
        label: component.label,
        minutes: component.minutes,
        reason: component.reason,
        source: component.source as BufferComponentInput["source"],
      })),
    })),
  };
}

async function normalizeReplaceRouteInput(
  args: Record<string, unknown>,
  context: ToolExecutionContext
) {
  const tripId = readTripId(args, context);
  const current = await loadCurrentRouteInputs(tripId, context.userId);
  const stopArgs = readOptionalArray(args, "stops");
  const legArgs = readOptionalArray(args, "legs");
  const stops = stopArgs ? stopArgs.map(normalizeStop) : current.stops;
  const legs = legArgs ? legArgs.map(normalizeLeg) : current.legs;
  const travelPlan =
    args.travelPlan === undefined
      ? parseTravelPlanJson(current.trip.travelPlanJson)
      : normalizeTravelPlan(args.travelPlan);

  if (context.purpose === "travel" && travelPlan) {
    assertTravelPlanAttractionCoverage(travelPlan);
  }

  if (!stops.length || !legs.length) {
    throw new Error(
      "Replacing stops or legs requires complete route data or an existing route to merge with."
    );
  }

  return {
    tripId,
    userId: context.userId,
    title: readOptionalString(args, "title") ?? current.trip.title,
    finalStopName:
      readOptionalString(args, "finalStopName") ??
      current.trip.finalStopName ??
      legs[legs.length - 1]?.destinationName ??
      stops[stops.length - 1]?.name,
    targetArriveAt:
      readOptionalDate(args, "targetArriveAt") ??
      current.trip.targetArriveAt ??
      undefined,
    status: readOptionalString(args, "status") ?? "monitoring",
    stops,
    legs,
    travelPlan: travelPlan ?? undefined,
  };
}

async function readSettings(context: ToolExecutionContext) {
  return recordToolCall({
    agentSessionId: context.sessionId,
    name: "read_settings",
    request: { userId: context.userId },
    signal: context.signal,
    run: async () => {
      const settings = await prisma.userSettings.findUnique({
        where: { userId: context.userId },
      });

      return settings ? normalizePlanningSettings(settings) : fallbackSettings();
    },
  });
}

async function loadPlanningSettings(userId: string): Promise<PlanningSettings> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  return settings ? normalizePlanningSettings(settings) : fallbackSettings();
}

async function executeToolCall(
  toolCall: AgentChatToolCall,
  context: ToolExecutionContext,
  settings: PlanningSettings
) {
  const name = getToolName(toolCall.name);
  const args = requireObject(toolCall.arguments, `${name} arguments`);
  const amap = context.amap;

  if (name === "read_settings") {
    return readSettings(context);
  }

  if (name === "read_memories") {
    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request: { userId: context.userId },
      signal: context.signal,
      run: async () =>
        prisma.memory.findMany({
          where: { userId: context.userId },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
    });
  }

  if (name === "search_poi") {
    const request = {
      keywords: readString(args, "keywords"),
      city: readOptionalString(args, "city") ?? settings.defaultCity,
    };
    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request,
      signal: context.signal,
      run: () => amap.searchPoi(request),
    });
  }

  if (name === "search_natural_attractions") {
    const city = readOptionalString(args, "city") ?? settings.defaultCity;
    const requestedLimit = readOptionalNumber(args, "limit") ?? 12;
    const limit = Math.min(12, Math.max(3, requestedLimit));

    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request: {
        city,
        limit,
        keywordGroups: NATURAL_ATTRACTION_SEARCH_GROUPS,
      },
      signal: context.signal,
      run: async () => {
        const batches = await Promise.all(
          NATURAL_ATTRACTION_SEARCH_GROUPS.map((keywords) =>
            amap.searchPoi({ keywords, city })
          )
        );
        const seen = new Set<string>();

        return batches
          .flat()
          .filter((poi) => {
            const key = poi.id || `${poi.name}:${poi.lngLat}`;
            if (seen.has(key)) {
              return false;
            }

            seen.add(key);
            return true;
          })
          .slice(0, limit);
      },
    });
  }

  if (name === "get_poi_detail") {
    const request = { id: readString(args, "id") };
    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request,
      signal: context.signal,
      run: () => amap.getPoiDetail(request),
    });
  }

  if (name === "get_weather_reference") {
    const request = {
      city: readOptionalString(args, "city") ?? settings.defaultCity,
    };
    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request,
      signal: context.signal,
      run: () => amap.getWeather(request),
    });
  }

  if (
    name === "get_transit_route" ||
    name === "get_driving_route" ||
    name === "get_walking_route" ||
    name === "get_bicycling_route"
  ) {
    const originInput = firstNonEmptyString(
      readOptionalString(args, "origin"),
      settings.originLngLat
    );
    const request = {
      origin: originInput ?? "",
      destination: readString(args, "destination"),
      city: readOptionalString(args, "city") ?? settings.defaultCity,
      cityd: readOptionalString(args, "cityd") ?? settings.defaultCity,
    };
    const route = (resolvedRequest: typeof request) =>
      name === "get_transit_route"
        ? amap.getTransitRoute(resolvedRequest)
        : name === "get_driving_route"
          ? amap.getDrivingRoute(resolvedRequest)
        : name === "get_walking_route"
          ? amap.getWalkingRoute(resolvedRequest)
          : amap.getBicyclingRoute(resolvedRequest);

    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request,
      signal: context.signal,
      run: async () => {
        if (!request.origin) {
          throw new Error(ORIGIN_REQUIRED_MESSAGE);
        }

        const resolvedRequest = {
          ...request,
          origin: await resolveRouteEndpoint({
            value: request.origin,
            label: "origin",
            city: request.city,
            context,
          }),
          destination: await resolveRouteEndpoint({
            value: request.destination,
            label: "destination",
            city: request.cityd,
            context,
          }),
        };

        return route(resolvedRequest);
      },
    });
  }

  if (name === "read_current_trip") {
    return readCurrentTrip(context, readTripId(args, context));
  }

  if (name === "update_trip_summary") {
    const tripId = readTripId(args, context);
    const travelPlan =
      args.travelPlan === undefined
        ? undefined
        : normalizeTravelPlan(args.travelPlan);

    if (context.purpose === "travel" && travelPlan) {
      assertTravelPlanAttractionCoverage(travelPlan);
    }

    const request = {
      tripId,
      userId: context.userId,
      title: readOptionalString(args, "title"),
      finalStopName: readOptionalString(args, "finalStopName"),
      targetArriveAt: readOptionalDate(args, "targetArriveAt"),
      status: readOptionalString(args, "status"),
      travelPlan,
    };
    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request,
      signal: context.signal,
      run: () => updateTripSummary(request),
    });
  }

  if (name === "replace_trip_stops" || name === "replace_trip_legs") {
    const request = await normalizeReplaceRouteInput(args, context);
    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request,
      signal: context.signal,
      run: async () => {
        const updated = await replaceTripRoute(request);
        context.tripId = updated.id;
        return updated;
      },
    });
  }

  if (name === "select_route_candidate") {
    const request = {
      tripId: readTripId(args, context),
      userId: context.userId,
      legId: readOptionalString(args, "legId"),
      legOrder: readOptionalNumber(args, "legOrder"),
      candidateId: readOptionalString(args, "candidateId"),
      candidateKey: readOptionalString(args, "candidateKey"),
    };
    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request,
      signal: context.signal,
      run: () => selectRouteCandidate(request),
    });
  }

  if (name === "replace_reminder_schedule") {
    const cadence = readOptionalArray(args, "cadenceMinutes")?.map((value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        throw new Error("cadenceMinutes must contain only numbers.");
      }
      return numeric;
    });
    const request = {
      tripId: readTripId(args, context),
      userId: context.userId,
      legId: readOptionalString(args, "legId"),
      legOrder: readOptionalNumber(args, "legOrder"),
      cadenceMinutes: cadence,
    };
    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request,
      signal: context.signal,
      run: () => replaceReminderSchedule(request),
    });
  }

  if (name === "cancel_trip_monitoring") {
    const request = {
      tripId: readTripId(args, context),
      userId: context.userId,
    };
    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request,
      signal: context.signal,
      run: () => cancelTripMonitoring(request),
    });
  }

  if (name === "create_memory_candidate") {
    const request = {
      tripId: readOptionalString(args, "tripId") ?? context.tripId,
      userId: context.userId,
      kind: readString(args, "kind"),
      label: readString(args, "label"),
      valueJson: args.valueJson,
    };
    return recordToolCall({
      agentSessionId: context.sessionId,
      name,
      request,
      signal: context.signal,
      run: () => createMemoryCandidateForTrip(request),
    });
  }

  const input = normalizeCreateTripInput(args, context, settings);
  let createdTripId: string | null = null;

  try {
    return await recordToolCall({
      agentSessionId: context.sessionId,
      name: "create_trip",
      request: input,
      signal: context.signal,
      run: async () => {
        const created = await createPlannedTrip(input);
        createdTripId = created.id;
        assertAgentRunActive(context.signal);
        return created;
      },
    });
  } catch (error) {
    if (createdTripId && context.signal?.aborted) {
      await prisma.trip
        .delete({ where: { id: createdTripId } })
        .catch(() => undefined);
    }

    throw error;
  }
}

function stringifyToolResult(result: unknown) {
  return JSON.stringify(result, (_key, value: unknown) => {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return value;
  });
}

const CONTINUATION_COMPLETION_TOOL_NAMES = new Set([
  "replace_trip_stops",
  "replace_trip_legs",
  "cancel_trip_monitoring",
]);

function shouldCompleteContinuationAfterTools(
  toolCalls: AgentChatToolCall[],
  requireCreateTrip: boolean
) {
  return (
    !requireCreateTrip &&
    toolCalls.some((toolCall) =>
      CONTINUATION_COMPLETION_TOOL_NAMES.has(toolCall.name)
    )
  );
}

async function runConversationAttempt(input: {
  sessionId: string;
  context: ToolExecutionContext;
  settings: PlanningSettings;
  messages: AgentChatMessage[];
  chatClient: AgentChatClient;
  signal?: AbortSignal;
  requireCreateTrip: boolean;
}) {
  let latestTripId = input.context.tripId ?? null;

  while (true) {
    assertAgentRunActive(input.signal);
    const completion = await input.chatClient.complete({
      messages: input.messages,
      tools: TOOL_DEFINITIONS,
      model:
        input.context.purpose === "travel"
          ? TRAVEL_PLANNING_MODEL
          : input.settings.model,
      signal: input.signal,
    });
    const assistantMessage = completion.message;
    input.messages.push(assistantMessage);

    await createAssistantMessage({
      sessionId: input.sessionId,
      signal: input.signal,
      content: assistantMessage.content || "AI 已请求调用工具。",
      metadata: {
        toolCalls: assistantMessage.toolCalls?.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.name,
        })),
      },
    });

    const toolCalls = assistantMessage.toolCalls ?? [];
    if (toolCalls.length === 0) {
      if (input.requireCreateTrip) {
        throw new Error("AI 结束了规划，但没有调用 create_trip。");
      }

      return {
        tripId: latestTripId,
        summary: assistantMessage.content,
      };
    }

    for (const toolCall of toolCalls) {
      assertAgentRunActive(input.signal);
      const result = await executeToolCall(
        toolCall,
        input.context,
        input.settings
      );
      const explicitTripId = readOptionalString(toolCall.arguments, "tripId");
      if (explicitTripId) {
        input.context.tripId = explicitTripId;
      }
      latestTripId = explicitTripId ?? input.context.tripId ?? latestTripId;
      input.messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: stringifyToolResult(result),
      });

      if (toolCall.name === "create_trip") {
        const trip = result as { id: string };
        latestTripId = trip.id;
        input.context.tripId = trip.id;

        if (input.requireCreateTrip) {
          await createAssistantMessage({
            sessionId: input.sessionId,
            signal: input.signal,
            content: "AI 已创建规划行程。",
            metadata: { tripId: trip.id },
          });

          return {
            tripId: trip.id,
            summary: "AI 已通过工具调用完成通勤规划。",
          };
        }
      }
    }

    if (shouldCompleteContinuationAfterTools(toolCalls, input.requireCreateTrip)) {
      const summary = "AI 已更新当前行程。";
      await createAssistantMessage({
        sessionId: input.sessionId,
        signal: input.signal,
        content: summary,
        metadata: { tripId: latestTripId },
      });

      return {
        tripId: latestTripId,
        summary,
      };
    }
  }
}

export async function startPlanningSession({
  currentLocation,
  purpose,
  userId,
  prompt,
}: StartPlanningSessionInput) {
  const normalizedPrompt = normalizePrompt(prompt);
  const currentLocationContext = buildCurrentLocationContext(currentLocation);
  const normalizedPurpose: AgentPlanningPurpose =
    purpose === "travel" ? "travel" : "planning";

  return prisma.agentSession.create({
    data: {
      userId,
      status: "running",
      purpose: normalizedPurpose,
      prompt: normalizedPrompt,
      timeoutMs: SESSION_TIMEOUT_MS,
      messages: {
        create: [
          ...(currentLocationContext
            ? [{ role: "system", content: currentLocationContext }]
            : []),
          {
            role: "user",
            content: normalizedPrompt,
          },
        ],
      },
    },
  });
}

export async function runPlanningSession(
  sessionId: string,
  options: RunPlanningSessionOptions = {}
): Promise<PlanningSessionResult> {
  try {
    const result = await runWithTimeoutAndRetry({
      timeoutMs: SESSION_TIMEOUT_MS,
      maxAttempts: SESSION_MAX_ATTEMPTS,
      run: async ({ attempt, signal }) =>
        runPlanningAttempt(sessionId, attempt, signal, options),
    });

    await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        status: "completed",
        retryCount: result.attempts - 1,
        tripId: result.value.tripId,
      },
    });

    return {
      sessionId,
      status: "completed",
      tripId: result.value.tripId,
    };
  } catch (error) {
    const timedOut = error instanceof AgentRunTimeoutError;
    const failed = await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        status: timedOut ? "timed_out" : "failed",
        messages: {
          create: {
            role: "assistant",
            content: formatPlanningFailureMessage(error),
          },
        },
      },
    });

    return {
      sessionId,
      status: timedOut ? "timed_out" : "failed",
      tripId: failed.tripId,
    };
  }
}

export async function continueAgentSession(
  input: ContinueAgentSessionInput,
  options: RunPlanningSessionOptions = {}
): Promise<PlanningSessionResult> {
  const accepted = await acceptAgentSessionMessage(input);
  return runAcceptedContinuationSession(accepted.id, options);
}

export async function acceptAgentSessionMessage({
  userId,
  sessionId,
  message,
}: ContinueAgentSessionInput) {
  const normalizedMessage = normalizePrompt(message);

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.agentSession.updateMany({
      where: {
        id: sessionId,
        userId,
        status: { not: "running" },
      },
      data: { status: "running" },
    });

    if (claimed.count !== 1) {
      const existing = await tx.agentSession.findFirst({
        where: { id: sessionId, userId },
      });

      if (!existing) {
        throw new AgentSessionNotFoundError();
      }

      throw new AgentSessionAlreadyRunningError();
    }

    await tx.agentMessage.create({
      data: {
        agentSessionId: sessionId,
        role: "user",
        content: normalizedMessage,
      },
    });

    return tx.agentSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
  });
}

export async function runAcceptedContinuationSession(
  sessionId: string,
  options: RunPlanningSessionOptions = {}
): Promise<PlanningSessionResult> {
  const session = await prisma.agentSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  try {
    const result = await runWithTimeoutAndRetry({
      timeoutMs: session.timeoutMs || SESSION_TIMEOUT_MS,
      maxAttempts: SESSION_MAX_ATTEMPTS,
      run: async ({ signal }) =>
        runContinuationAttempt(sessionId, signal, options),
    });

    const completed = await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        status: "completed",
        retryCount: result.attempts - 1,
        tripId: result.value.tripId,
      },
    });

    return {
      sessionId,
      status: "completed",
      tripId: completed.tripId,
    };
  } catch (error) {
    const timedOut = error instanceof AgentRunTimeoutError;
    const failed = await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        status: timedOut ? "timed_out" : "failed",
        messages: {
          create: {
            role: "assistant",
            content: formatPlanningFailureMessage(error),
          },
        },
      },
    });

    return {
      sessionId,
      status: timedOut ? "timed_out" : "failed",
      tripId: failed.tripId,
    };
  }
}

async function runContinuationAttempt(
  sessionId: string,
  signal?: AbortSignal,
  options: RunPlanningSessionOptions = {}
): Promise<{ tripId: string | null; summary: string }> {
  assertAgentRunActive(signal);
  const session = await prisma.agentSession.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const settings = await loadPlanningSettings(session.userId);
  const chatClient = options.chatClient ?? createOpenAiChatClient();
  const context: ToolExecutionContext = {
    amap: options.amapClient ?? createAmapClient(),
    sessionId,
    userId: session.userId,
    prompt: session.prompt,
    purpose: session.purpose === "travel" ? "travel" : "planning",
    tripId: session.tripId,
    signal,
  };
  const messages = await createContinuationMessages(session);
  const result = await runConversationAttempt({
    sessionId,
    context,
    settings,
    messages,
    chatClient,
    signal,
    requireCreateTrip: false,
  });

  return {
    tripId: result.tripId ?? session.tripId,
    summary: result.summary,
  };
}

export async function runPlanningAttempt(
  sessionId: string,
  attempt = 1,
  signal?: AbortSignal,
  options: RunPlanningSessionOptions = {}
): Promise<PlanningAttemptResult> {
  assertAgentRunActive(signal);
  const session = await prisma.agentSession.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const settings = await loadPlanningSettings(session.userId);
  const chatClient = options.chatClient ?? createOpenAiChatClient();
  const context: ToolExecutionContext = {
    amap: options.amapClient ?? createAmapClient(),
    sessionId,
    userId: session.userId,
    prompt: session.prompt,
    purpose: session.purpose === "travel" ? "travel" : "planning",
    signal,
  };
  const messages = await createInitialMessages(session, attempt);

  await createAssistantMessage({
    sessionId,
    signal,
    content: `第 ${attempt} 次规划尝试：AI 可以持续调用工具，直到创建最终行程。`,
  });

  const result = await runConversationAttempt({
    sessionId,
    context,
    settings,
    messages,
    chatClient,
    signal,
    requireCreateTrip: true,
  });

  if (!result.tripId) {
    throw new Error("AI 结束了规划，但没有创建行程。");
  }

  return {
    tripId: result.tripId,
    summary: result.summary,
  };
}
