import { describe, expect, it, vi } from "vitest";
import {
  buildTripSwitchKeyboard,
  parseTelegramCallbackData,
  parseTelegramCommand,
} from "@/lib/telegram/commands";
import {
  formatFinalTripPlanMessage,
  formatBoundHelpMessage,
  formatTelegramAgentEvent,
  splitTelegramMessage,
  formatTripListMessage,
  formatTripSummaryLine,
} from "@/lib/telegram/messages";

describe("Telegram command parsing", () => {
  it("parses commands and command payloads", () => {
    expect(parseTelegramCommand("/start")).toEqual({ kind: "start" });
    expect(parseTelegramCommand("/new")).toEqual({ kind: "new", prompt: "" });
    expect(parseTelegramCommand("/new 明天九点到外事学校")).toEqual({
      kind: "new",
      prompt: "明天九点到外事学校",
    });
    expect(parseTelegramCommand("/trips")).toEqual({ kind: "trips" });
    expect(parseTelegramCommand("/status")).toEqual({ kind: "status" });
    expect(parseTelegramCommand("/cancel")).toEqual({ kind: "cancel" });
    expect(parseTelegramCommand("明天九点到外事学校")).toEqual({
      kind: "plain_text",
      text: "明天九点到外事学校",
    });
  });

  it("ignores bot username suffixes in commands", () => {
    expect(parseTelegramCommand("/new@CommutePlannerBot 明早到学校")).toEqual({
      kind: "new",
      prompt: "明早到学校",
    });
  });

  it("parses trip switch callback data", () => {
    expect(parseTelegramCallbackData("sw:trip_123")).toEqual({
      kind: "switch_trip",
      tripId: "trip_123",
    });
    expect(parseTelegramCallbackData("bad:trip_123")).toEqual({
      kind: "unknown",
    });
  });

  it("builds compact inline keyboards for trip switching", () => {
    const keyboard = buildTripSwitchKeyboard([
      { id: "trip_123", title: "家-外事学校" },
      { id: "trip_456", title: "家-天街" },
    ]);

    expect(keyboard.inline_keyboard).toEqual([
      [{ text: "切换到此行程：家-外事学校", callback_data: "sw:trip_123" }],
      [{ text: "切换到此行程：家-天街", callback_data: "sw:trip_456" }],
    ]);
    for (const row of keyboard.inline_keyboard) {
      expect(Buffer.byteLength(row[0].callback_data, "utf8")).toBeLessThanOrEqual(64);
    }
  });

  it("formats short Chinese messages", () => {
    expect(formatBoundHelpMessage({ hasActiveTrip: true })).toContain("/trips");
    expect(formatTripSummaryLine({
      title: "家-外事学校",
      status: "monitoring",
      scheduledReminderCount: 3,
      targetArriveAt: new Date("2026-07-01T01:00:00.000Z"),
    })).toContain("家-外事学校");
    expect(formatTripListMessage([])).toBe("最近没有可切换的行程。");
  });

  it("formats agent timeline events for Telegram progress updates", () => {
    expect(
      formatTelegramAgentEvent({
        id: "message-user",
        kind: "message",
        title: "用户请求",
        detail: "明天九点到外事学校",
        status: "user",
        createdAt: "2026-06-30T09:00:00.000Z",
      })
    ).toBe("用户请求\n明天九点到外事学校");

    expect(
      formatTelegramAgentEvent({
        id: "tool-running",
        kind: "tool",
        title: "查询公交/地铁路线",
        detail: "已记录工具调用",
        status: "running",
        createdAt: "2026-06-30T09:00:01.000Z",
      })
    ).toBe("工具调用：查询公交/地铁路线\n状态：运行中\n已记录工具调用");

    expect(
      formatTelegramAgentEvent({
        id: "tool-failed",
        kind: "tool",
        title: "获取天气参考",
        detail: "AMap unavailable",
        status: "failed",
        createdAt: "2026-06-30T09:00:02.000Z",
      })
    ).toBe("工具调用：获取天气参考\n状态：失败\nAMap unavailable");
  });

  it("splits long Telegram messages without empty chunks", () => {
    const chunks = splitTelegramMessage(["开头", "x".repeat(3600), "结尾"].join("\n"));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
    expect(chunks.every((chunk) => chunk.length <= 3500)).toBe(true);
    expect(chunks.join("\n")).toContain("开头");
    expect(chunks.join("\n")).toContain("结尾");
  });

  it("formats a final trip plan with Beijing times, legs, buffers, reminders, and monitoring status", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T23:00:00.000Z"));

    const message = formatFinalTripPlanMessage({
      title: "家-办公室",
      status: "monitoring",
      targetArriveAt: new Date("2026-07-01T01:00:00.000Z"),
      createdAt: new Date("2026-06-30T00:00:00.000Z"),
      legs: [
        {
          id: "leg-1",
          originName: "家",
          destinationName: "地铁站",
          latestDepartAt: new Date("2026-07-01T00:10:00.000Z"),
          targetArriveAt: new Date("2026-07-01T00:30:00.000Z"),
          selectedCandidate: {
            title: "步行到地铁站",
            routeMinutes: 15,
            bufferMinutes: 5,
            totalMinutes: 20,
            rationale: "距离较近，步行稳定。",
          },
          routeSegments: [
            {
              title: "沿主路步行",
              detail: "从东门出发",
              minutes: 15,
              mode: "walk",
            },
          ],
          bufferComponents: [
            {
              label: "进站缓冲",
              minutes: 5,
              reason: "预留安检时间。",
              category: "transfer",
              source: "agent_inference",
            },
            {
              label: "天气参考",
              minutes: 0,
              reason: "小雨，仅作参考。",
              category: "weather_context",
              source: "weather_context",
            },
          ],
        },
        {
          id: "leg-2",
          originName: "地铁站",
          destinationName: "办公室",
          latestDepartAt: new Date("2026-07-01T00:35:00.000Z"),
          targetArriveAt: new Date("2026-07-01T01:00:00.000Z"),
          selectedCandidate: {
            title: "地铁到办公室",
            routeMinutes: 20,
            bufferMinutes: 5,
            totalMinutes: 25,
            rationale: "准点率更高。",
          },
          routeSegments: [
            {
              title: "乘坐 1 号线",
              detail: "4 站后下车",
              minutes: 20,
              mode: "transit",
            },
          ],
          bufferComponents: [
            {
              label: "换乘缓冲",
              minutes: 5,
              reason: "预留出站时间。",
              category: "transfer",
              source: "agent_inference",
            },
          ],
        },
      ],
      reminderJobs: [
        {
          kind: "recheck",
          status: "scheduled",
          scheduledFor: new Date("2026-07-01T00:40:00.000Z"),
        },
        {
          kind: "depart_now",
          status: "scheduled",
          scheduledFor: new Date("2026-07-01T00:10:00.000Z"),
        },
      ],
      latestRecalculation: null,
    });

    vi.useRealTimers();

    expect(message).toContain("最终行程计划");
    expect(message).toContain("家-办公室");
    expect(message).toContain("目标到达：07月01日 09:00");
    expect(message).toContain("最晚出发：07月01日 08:10");
    expect(message).toContain("总路程 35 分钟 + 缓冲 10 分钟");
    expect(message).toContain("第 1 段：家 到 地铁站");
    expect(message).toContain("沿主路步行（15 分钟）");
    expect(message).toContain("天气参考：0 分钟，仅作天气参考。小雨，仅作参考。");
    expect(message).toContain("路线复查：07月01日 08:40，等待复查");
    expect(message).toContain("现在出发：07月01日 08:10，等待提醒");
    expect(message).toContain("监控状态：监控已开启");
  });
});
