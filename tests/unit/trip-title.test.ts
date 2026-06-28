import { describe, expect, it } from "vitest";
import { normalizeRouteTitle } from "@/lib/trips/title";

describe("normalizeRouteTitle", () => {
  it("formats a single-leg route as origin-destination without time text", () => {
    expect(
      normalizeRouteTitle({
        title: "明天10:00 外事学校到东钱湖地铁站",
        originName: "外事学校",
        destinationName: "东钱湖地铁站",
      })
    ).toBe("外事学校-东钱湖地铁站");
  });

  it("falls back to the provided title when endpoints are missing", () => {
    expect(normalizeRouteTitle({ title: "临时行程" })).toBe("临时行程");
  });
});
