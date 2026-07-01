import { describe, expect, it } from "vitest";
import { buildTemplateTestEmails } from "@/lib/notifications/test-email-samples";

describe("template test emails", () => {
  it("builds one departure email and one route-change email", () => {
    const emails = buildTemplateTestEmails({
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(emails).toHaveLength(2);
    expect(emails[0]).toMatchObject({
      label: "到点提醒",
      subject: "通勤提醒：该出发了",
    });
    expect(emails[0].html).toContain("该出发了");
    expect(emails[1]).toMatchObject({
      label: "时间更新",
      subject: "通勤时间已变化：测试通勤路线",
    });
    expect(emails[1].html).toContain("出发时间已更新");
  });
});
