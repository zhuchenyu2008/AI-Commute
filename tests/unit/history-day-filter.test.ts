import { describe, expect, it } from "vitest";
import {
  getBeijingDateInputValue,
  getBeijingDayRange,
} from "@/lib/history/day-filter";

describe("history day filter helpers", () => {
  it("defaults to the Beijing calendar day", () => {
    expect(getBeijingDateInputValue(new Date("2026-06-29T16:30:00.000Z"))).toBe(
      "2026-06-30"
    );
  });

  it("builds an inclusive-exclusive UTC range for a Beijing day", () => {
    expect(getBeijingDayRange("2026-06-30")).toEqual({
      start: new Date("2026-06-29T16:00:00.000Z"),
      end: new Date("2026-06-30T16:00:00.000Z"),
      value: "2026-06-30",
    });
  });
});
