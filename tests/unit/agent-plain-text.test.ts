import { describe, expect, it } from "vitest";
import { sanitizeAgentVisibleReply } from "@/lib/agent/plain-text";

describe("sanitizeAgentVisibleReply", () => {
  it("removes markdown emphasis and list markers from assistant replies", () => {
    expect(
      sanitizeAgentVisibleReply("已改成 **17:00**\n- 出行方式：小遛")
    ).toBe("已改成 17:00\n出行方式：小遛");
  });

  it("cleans headings, backticks, and numbered lists into plain text", () => {
    expect(
      sanitizeAgentVisibleReply(
        "### 调整结果\n`17:00` 出发\n1. 先坐地铁\n2. 再步行"
      )
    ).toBe("调整结果\n17:00 出发\n先坐地铁\n再步行");
  });
});
