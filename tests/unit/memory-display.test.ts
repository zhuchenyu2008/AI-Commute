import { describe, expect, it } from "vitest";
import { formatMemoryKind } from "@/lib/memories/display";

describe("memory display", () => {
  it("formats memory kind values for users", () => {
    expect(formatMemoryKind("place")).toBe("地点");
    expect(formatMemoryKind("route_preference")).toBe("路线偏好");
    expect(formatMemoryKind("unknown_kind")).toBe("记忆");
  });
});
