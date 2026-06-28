import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Prisma schema", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");

  it("models the Agent-centered multi-stop trip graph", () => {
    for (const model of [
      "User",
      "Session",
      "UserSettings",
      "AgentSession",
      "AgentMessage",
      "AgentToolCall",
      "Trip",
      "TripStop",
      "TripLeg",
      "RouteCandidate",
      "RouteSegment",
      "BufferComponent",
      "ReminderJob",
      "RecalculationLog",
      "NotificationLog",
      "Memory",
      "MemoryCandidate"
    ]) {
      expect(schema).toContain(`model ${model}`);
    }
  });

  it("stores ordered stops and legs for multi-stop itineraries", () => {
    expect(schema).toContain("order           Int");
    expect(schema).toContain("fromStopId      String?");
    expect(schema).toContain("toStopId        String");
  });
});
