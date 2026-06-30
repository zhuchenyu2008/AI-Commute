import { describe, expect, it } from "vitest";
import {
  buildTripSwitchKeyboard,
  parseTelegramCallbackData,
  parseTelegramCommand,
} from "@/lib/telegram/commands";
import {
  formatBoundHelpMessage,
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
});
