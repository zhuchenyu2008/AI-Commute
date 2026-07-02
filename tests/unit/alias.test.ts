import { describe, expect, it } from "vitest";
import { APP_NAME, AUTHOR_NAME, REPOSITORY_URL } from "@/lib/project";

describe("test aliases", () => {
  it("resolves src aliases from the project root", () => {
    expect(APP_NAME).toBe("AI Commute");
    expect(AUTHOR_NAME).toBe("ZhuChenyu");
    expect(REPOSITORY_URL).toBe("https://github.com/zhuchenyu2008/Commute-Planner");
  });
});
