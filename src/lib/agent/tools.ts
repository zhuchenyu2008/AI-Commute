import { prisma } from "@/lib/db";
import { amapService } from "@/lib/services/amap";
import { planTripFromText, recheckTrip, getProfile } from "@/lib/planning/planner";
import { serializeMemory, serializeTrip } from "@/lib/trips/serialize";
import type { AgentToolContext, AgentToolDefinition } from "@/lib/agent/types";

type ToolHandler = (args: Record<string, unknown>, context: AgentToolContext) => Promise<unknown>;

const toolDefinitions: AgentToolDefinition[] = [
  {
    name: "get_profile",
    description: "Read the user's default city, origin, timezone, route buffers, and preferences.",
    parameters: objectSchema({})
  },
  {
    name: "list_memories",
    description: "Read saved agent memories, places, aliases, and preferences.",
    parameters: objectSchema({
      type: { type: "string" },
      status: { type: "string" }
    })
  },
  {
    name: "search_poi",
    description: "Search AMap POIs for a destination keyword in the user's city.",
    parameters: objectSchema({
      keyword: { type: "string" },
      city: { type: "string" }
    })
  },
  {
    name: "get_weather",
    description: "Fetch current weather for a city.",
    parameters: objectSchema({
      city: { type: "string" }
    })
  },
  {
    name: "estimate_route",
    description: "Estimate a route duration by mode using AMap.",
    parameters: objectSchema({
      origin: { type: "string" },
      destination: { type: "string" },
      city: { type: "string" },
      mode: { type: "string", enum: ["transit", "bike", "walk"] }
    })
  },
  {
    name: "create_commute_plan",
    description: "Create a complete commute trip, route options, reminders, and agent memories from natural language.",
    parameters: objectSchema({
      text: { type: "string" }
    })
  },
  {
    name: "save_memory",
    description: "Save a confirmed agent memory with provenance and confidence.",
    parameters: objectSchema({
      type: { type: "string" },
      label: { type: "string" },
      value: { type: "object" },
      sourceText: { type: "string" },
      confidence: { type: "number" },
      confidenceReason: { type: "string" }
    })
  },
  {
    name: "cancel_trip",
    description: "Cancel an active trip and pending reminders.",
    parameters: objectSchema({
      tripId: { type: "string" }
    })
  },
  {
    name: "recheck_route_watch",
    description: "Recheck a locked trip during a scheduled reminder turn and decide whether reminders should change.",
    parameters: objectSchema({
      tripId: { type: "string" },
      jobId: { type: "string" },
      payload: { type: "object" }
    })
  }
];

const handlers: Record<string, ToolHandler> = {
  async get_profile() {
    return getProfile();
  },

  async list_memories(args) {
    const status = stringArg(args.status) || "confirmed";
    const type = stringArg(args.type) || undefined;
    const memories = await prisma.memory.findMany({
      where: { type, status, deletedAt: null },
      orderBy: { createdAt: "desc" }
    });
    return { memories: memories.map(serializeMemory) };
  },

  async search_poi(args) {
    const profile = await getProfile();
    const keyword = requiredString(args.keyword, "keyword");
    return amapService.searchPoi(keyword, stringArg(args.city) || profile.city);
  },

  async get_weather(args) {
    const profile = await getProfile();
    return amapService.weather(stringArg(args.city) || profile.city);
  },

  async estimate_route(args) {
    const profile = await getProfile();
    const origin = requiredString(args.origin, "origin");
    const destination = requiredString(args.destination, "destination");
    const city = stringArg(args.city) || profile.city;
    const mode = stringArg(args.mode) || "transit";
    if (mode === "bike") return amapService.bikeDuration(origin, destination);
    if (mode === "walk") return amapService.walkingDuration(origin, destination);
    return amapService.transitDuration(origin, destination, city, city);
  },

  async create_commute_plan(args, context) {
    const text = stringArg(args.text) || context.userText;
    const result = await planTripFromText(text, { agentSessionId: context.sessionId });
    return {
      ...result,
      trip: result.tripId
        ? serializeTrip(
            await prisma.trip.findUniqueOrThrow({
              where: { id: result.tripId },
              include: { routeOptions: true, segments: true, reminderJobs: true }
            })
          )
        : null
    };
  },

  async save_memory(args, context) {
    const label = requiredString(args.label, "label");
    const type = stringArg(args.type) || "general_note";
    const confidence = typeof args.confidence === "number" ? args.confidence : 0.75;
    const value = isRecord(args.value) ? args.value : {};
    const memory = await prisma.memory.create({
      data: {
        agentSessionId: context.sessionId,
        type,
        status: "confirmed",
        label,
        valueJson: JSON.stringify(value),
        metadataJson: JSON.stringify({
          createdBy: "agent",
          confidenceReason: stringArg(args.confidenceReason) || "Agent 自动保存",
          sessionId: context.sessionId
        }),
        sourceText: stringArg(args.sourceText) || context.userText,
        confidence
      }
    });
    return { memory: serializeMemory(memory) };
  },

  async cancel_trip(args) {
    const tripId = requiredString(args.tripId, "tripId");
    await prisma.reminderJob.updateMany({
      where: { tripId, status: "pending" },
      data: { status: "cancelled" }
    });
    const trip = await prisma.trip.update({
      where: { id: tripId },
      data: { status: "cancelled" },
      include: { routeOptions: true, segments: true, reminderJobs: true }
    });
    return { trip: serializeTrip(trip) };
  },

  async recheck_route_watch(args) {
    const tripId = requiredString(args.tripId, "tripId");
    const trip = await recheckTrip(tripId);
    return { trip: serializeTrip(trip), decision: "rechecked" };
  }
};

export function getAgentToolDefinitions() {
  return toolDefinitions;
}

export async function executeAgentTool(name: string, args: Record<string, unknown>, context: AgentToolContext) {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Unknown agent tool: ${name}`);
  }
  return handler(args, context);
}

function objectSchema(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "object",
    properties,
    additionalProperties: false
  };
}

function requiredString(value: unknown, name: string) {
  const text = stringArg(value);
  if (!text) {
    throw new Error(`${name} is required`);
  }
  return text;
}

function stringArg(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
