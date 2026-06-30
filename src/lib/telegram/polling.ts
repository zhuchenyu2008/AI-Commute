import { createTelegramBotClient, type TelegramBotClient } from "./client";
import { handleTelegramUpdate } from "./handler";
import {
  getNextTelegramOffset,
  markTelegramUpdateProcessed,
} from "./state";
import type { TelegramUpdate } from "./types";

export type ProcessTelegramPollingBatchInput = {
  bot: TelegramBotClient;
  offset?: number;
  timeoutSeconds: number;
  handleUpdate(update: TelegramUpdate): Promise<void>;
  markProcessed(updateId: number): Promise<unknown>;
};

export async function processTelegramPollingBatch(
  input: ProcessTelegramPollingBatchInput
): Promise<number> {
  const updates = await input.bot.getUpdates({
    offset: input.offset,
    timeoutSeconds: input.timeoutSeconds,
  });

  for (const update of updates) {
    await input.handleUpdate(update);
    await input.markProcessed(update.update_id);
  }

  return updates.length;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}

export async function runTelegramPolling(input: {
  token: string;
  timeoutSeconds?: number;
  idleDelayMs?: number;
  signal?: AbortSignal;
}): Promise<void> {
  const bot = createTelegramBotClient({ token: input.token });
  const timeoutSeconds = input.timeoutSeconds ?? 30;
  const idleDelayMs = input.idleDelayMs ?? 1000;

  while (!input.signal?.aborted) {
    const offset = await getNextTelegramOffset();

    await processTelegramPollingBatch({
      bot,
      offset,
      timeoutSeconds,
      handleUpdate: (update) => handleTelegramUpdate({ update, bot }),
      markProcessed: markTelegramUpdateProcessed,
    });

    await sleep(idleDelayMs, input.signal);
  }
}
