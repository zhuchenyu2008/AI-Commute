import { describe, expect, it, vi } from "vitest";
import { processTelegramPollingBatch } from "@/lib/telegram/polling";
import type { TelegramBotClient } from "@/lib/telegram/client";

describe("telegram polling", () => {
  it("fetches updates from the current offset and marks each processed update", async () => {
    const bot: TelegramBotClient = {
      getUpdates: vi.fn().mockResolvedValue([
        {
          update_id: 10,
          message: { message_id: 1, chat: { id: "chat" }, text: "/start" },
        },
        {
          update_id: 11,
          message: { message_id: 2, chat: { id: "chat" }, text: "/status" },
        },
      ]),
      sendMessage: vi.fn(),
      answerCallbackQuery: vi.fn(),
    };
    const handler = vi.fn().mockResolvedValue(undefined);
    const markProcessed = vi.fn().mockResolvedValue(undefined);

    const processed = await processTelegramPollingBatch({
      bot,
      offset: 10,
      timeoutSeconds: 1,
      handleUpdate: handler,
      markProcessed,
    });

    expect(processed).toBe(2);
    expect(bot.getUpdates).toHaveBeenCalledWith({ offset: 10, timeoutSeconds: 1 });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(markProcessed).toHaveBeenCalledWith(10);
    expect(markProcessed).toHaveBeenCalledWith(11);
  });

  it("does not mark an update processed when its handler fails", async () => {
    const markProcessed = vi.fn();
    const bot: TelegramBotClient = {
      getUpdates: vi.fn().mockResolvedValue([
        {
          update_id: 12,
          message: { message_id: 1, chat: { id: "chat" }, text: "/start" },
        },
      ]),
      sendMessage: vi.fn(),
      answerCallbackQuery: vi.fn(),
    };

    await expect(
      processTelegramPollingBatch({
        bot,
        offset: 12,
        timeoutSeconds: 1,
        handleUpdate: vi.fn().mockRejectedValue(new Error("handler failed")),
        markProcessed,
      })
    ).rejects.toThrow("handler failed");

    expect(markProcessed).not.toHaveBeenCalled();
  });

  it("stops processing after a failed update without marking it processed", async () => {
    const bot: TelegramBotClient = {
      getUpdates: vi.fn().mockResolvedValue([
        {
          update_id: 20,
          message: { message_id: 1, chat: { id: "chat" }, text: "/start" },
        },
        {
          update_id: 21,
          message: { message_id: 2, chat: { id: "chat" }, text: "/status" },
        },
      ]),
      sendMessage: vi.fn(),
      answerCallbackQuery: vi.fn(),
    };
    const handler = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("second failed"));
    const markProcessed = vi.fn().mockResolvedValue(undefined);

    await expect(
      processTelegramPollingBatch({
        bot,
        offset: 20,
        timeoutSeconds: 1,
        handleUpdate: handler,
        markProcessed,
      })
    ).rejects.toThrow("second failed");

    expect(handler).toHaveBeenCalledTimes(2);
    expect(markProcessed).toHaveBeenCalledTimes(1);
    expect(markProcessed).toHaveBeenCalledWith(20);
    expect(markProcessed).not.toHaveBeenCalledWith(21);
  });
});
