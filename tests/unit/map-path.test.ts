import { describe, expect, it } from "vitest";
import { buildMapPath } from "@/lib/trips/map-path";

describe("buildMapPath", () => {
  it("removes the duplicated origin when it is also the first stop", () => {
    expect(
      buildMapPath("Home", [
        { name: "Home" },
        { name: "Station" },
        { name: "Office" },
      ])
    ).toEqual(["Home", "Station", "Office"]);
  });

  it("keeps non-adjacent repeated places for real return routes", () => {
    expect(
      buildMapPath("Home", [
        { name: "Station" },
        { name: "Office" },
        { name: "Station" },
      ])
    ).toEqual(["Home", "Station", "Office", "Station"]);
  });

  it("ignores blank names and compares trimmed values", () => {
    expect(
      buildMapPath(" Home ", [
        { name: "Home" },
        { name: "" },
        { name: "  Station  " },
        { name: null },
      ])
    ).toEqual(["Home", "Station"]);
  });
});
