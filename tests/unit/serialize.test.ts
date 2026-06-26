import { describe, expect, it } from "vitest";
import { serializeMemory } from "@/lib/trips/serialize";

describe("serializers", () => {
  it("includes agent memory provenance when serializing memories", () => {
    const memory = serializeMemory({
      id: "memory-1",
      type: "place",
      status: "confirmed",
      label: "公司",
      valueJson: JSON.stringify({ name: "科技园中心" }),
      metadataJson: JSON.stringify({ createdBy: "agent", confidenceReason: "用户说以后常去" }),
      agentSessionId: "session-1"
    });

    expect(memory.value).toEqual({ name: "科技园中心" });
    expect(memory.metadata).toEqual({ createdBy: "agent", confidenceReason: "用户说以后常去" });
    expect(memory.agentSessionId).toBe("session-1");
  });
});
