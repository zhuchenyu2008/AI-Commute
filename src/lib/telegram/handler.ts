import { prisma } from "@/lib/db";
import {
  AgentSessionAlreadyRunningError,
  AgentSessionNotFoundError,
} from "@/lib/agent/planner";
import {
  cancelTripMonitoring,
  TripMonitoringNotFoundError,
} from "@/lib/trips/monitoring";
import type { TelegramBotClient } from "./client";
import {
  buildTripSwitchKeyboard,
  parseTelegramCallbackData,
  parseTelegramCommand,
} from "./commands";
import {
  formatBoundHelpMessage,
  formatTripListMessage,
  formatUnboundMessage,
} from "./messages";
import {
  findBoundTelegramUser,
  getTelegramChatState,
  listSwitchableTrips,
  setTelegramActiveConversation,
  setTelegramAwaitingNewPrompt,
  switchTelegramActiveTrip,
} from "./state";
import type { TelegramUpdate } from "./types";
import {
  createTelegramAgentBridge,
  type TelegramAgentBridge,
} from "./agent-bridge";

export type HandleTelegramUpdateInput = {
  update: TelegramUpdate;
  bot: TelegramBotClient;
  agentBridge?: TelegramAgentBridge;
};

type BoundUser = { chatId: string; userId: string };

function logTelegramSendFailure(context: string, error: unknown) {
  console.error(`Telegram ${context} send failed.`, error);
}

async function sendBestEffort(
  bot: TelegramBotClient,
  input: Parameters<TelegramBotClient["sendMessage"]>[0],
  context: string
) {
  try {
    await bot.sendMessage(input);
  } catch (error) {
    logTelegramSendFailure(context, error);
  }
}

async function getBoundChatState(chatId: string, userId: string) {
  const state = await getTelegramChatState(chatId);
  if (!state || state.userId !== userId) return null;
  return state;
}

async function clearBoundChatState(input: { chatId: string; userId: string }) {
  await prisma.telegramChatState.updateMany({
    where: { chatId: input.chatId, userId: input.userId },
    data: {
      activeAgentSessionId: null,
      activeTripId: null,
      mode: "idle",
    },
  });
}

async function resolveBoundUser(input: {
  chatId: string;
  bot: TelegramBotClient;
}): Promise<BoundUser | null> {
  const result = await findBoundTelegramUser(input.chatId);

  if (result.status === "unbound") {
    await input.bot.sendMessage({
      chatId: input.chatId,
      text: formatUnboundMessage(input.chatId),
    });
    return null;
  }

  if (result.status === "ambiguous") {
    await input.bot.sendMessage({
      chatId: input.chatId,
      text: "多个用户绑定同一个 Telegram Chat ID，请先在网站设置页修正。",
    });
    return null;
  }

  return { chatId: input.chatId, userId: result.user.id };
}

async function resolveCallbackBoundUser(input: {
  chatId: string;
  callbackQueryId: string;
  bot: TelegramBotClient;
}): Promise<BoundUser | null> {
  const result = await findBoundTelegramUser(input.chatId);

  if (result.status === "unbound") {
    const text = formatUnboundMessage(input.chatId);
    await input.bot.answerCallbackQuery({
      callbackQueryId: input.callbackQueryId,
      text,
    });
    await input.bot.sendMessage({
      chatId: input.chatId,
      text,
    });
    return null;
  }

  if (result.status === "ambiguous") {
    const text = "多个用户绑定同一个 Telegram Chat ID，请先在网站设置页修正。";
    await input.bot.answerCallbackQuery({
      callbackQueryId: input.callbackQueryId,
      text,
    });
    await input.bot.sendMessage({
      chatId: input.chatId,
      text,
    });
    return null;
  }

  return { chatId: input.chatId, userId: result.user.id };
}

async function startNewPlanning(input: {
  bot: TelegramBotClient;
  bridge: TelegramAgentBridge;
  chatId: string;
  userId: string;
  prompt: string;
}) {
  await input.bot.sendMessage({
    chatId: input.chatId,
    text: "已开始规划，我来处理。",
  });

  const result = await input.bridge.startPlanning({
    userId: input.userId,
    prompt: input.prompt,
  });

  await setTelegramActiveConversation({
    chatId: input.chatId,
    userId: input.userId,
    agentSessionId: result.sessionId,
    tripId: result.tripId,
  });

  await sendBestEffort(
    input.bot,
    {
      chatId: input.chatId,
      text: result.summary,
    },
    "planning summary"
  );
}

async function continueActiveSession(input: {
  bot: TelegramBotClient;
  bridge: TelegramAgentBridge;
  chatId: string;
  userId: string;
  sessionId: string;
  message: string;
  fallbackTripId?: string | null;
}) {
  await input.bot.sendMessage({
    chatId: input.chatId,
    text: "收到，我继续处理。",
  });

  let result: Awaited<ReturnType<TelegramAgentBridge["continueSession"]>>;
  try {
    result = await input.bridge.continueSession({
      userId: input.userId,
      sessionId: input.sessionId,
      message: input.message,
    });
  } catch (error) {
    if (
      !(
        error instanceof AgentSessionAlreadyRunningError ||
        error instanceof AgentSessionNotFoundError
      )
    ) {
      throw error;
    }

    await input.bot.sendMessage({
      chatId: input.chatId,
      text: "当前对话暂时不能继续处理，请稍后再试或发送 /new 重新规划。",
    });
    return;
  }

  await setTelegramActiveConversation({
    chatId: input.chatId,
    userId: input.userId,
    agentSessionId: result.sessionId,
    tripId: result.tripId ?? input.fallbackTripId ?? null,
  });

  await sendBestEffort(
    input.bot,
    {
      chatId: input.chatId,
      text: result.summary,
    },
    "continuation summary"
  );
}

async function handlePlainText(input: {
  bot: TelegramBotClient;
  bridge: TelegramAgentBridge;
  chatId: string;
  userId: string;
  text: string;
}) {
  const text = input.text.trim();
  if (!text) {
    await input.bot.sendMessage({
      chatId: input.chatId,
      text: "请发送具体的出行需求或命令。",
    });
    return;
  }

  const state = await getBoundChatState(input.chatId, input.userId);
  const activeSessionId = state?.activeAgentSessionId;

  if (state?.mode === "awaiting_new_prompt" || !activeSessionId) {
    await startNewPlanning({ ...input, prompt: text });
    return;
  }

  const session = await prisma.agentSession.findFirst({
    where: { id: activeSessionId, userId: input.userId },
  });

  if (!session) {
    await startNewPlanning({ ...input, prompt: text });
    return;
  }

  if (session.status === "running") {
    await input.bot.sendMessage({
      chatId: input.chatId,
      text: "智能体还在处理，请稍后再发送新的消息。",
    });
    return;
  }

  await continueActiveSession({
    ...input,
    sessionId: activeSessionId,
    message: text,
    fallbackTripId: state.activeTripId,
  });
}

async function handleMessage(input: Required<HandleTelegramUpdateInput>) {
  const message = input.update.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  const bound = await resolveBoundUser({ chatId, bot: input.bot });
  if (!bound) return;

  if (!message.text) {
    await input.bot.sendMessage({
      chatId,
      text: "当前只支持文本规划和命令。",
    });
    return;
  }

  const command = parseTelegramCommand(message.text);

  if (command.kind === "start") {
    const state = await getBoundChatState(chatId, bound.userId);
    await input.bot.sendMessage({
      chatId,
      text: formatBoundHelpMessage({ hasActiveTrip: Boolean(state?.activeTripId) }),
    });
    return;
  }

  if (command.kind === "new") {
    if (!command.prompt) {
      await setTelegramAwaitingNewPrompt({ chatId, userId: bound.userId });
      await input.bot.sendMessage({
        chatId,
        text: "请发送新的出行需求，我会从头开始规划。",
      });
      return;
    }

    await startNewPlanning({
      bot: input.bot,
      bridge: input.agentBridge,
      chatId,
      userId: bound.userId,
      prompt: command.prompt,
    });
    return;
  }

  if (command.kind === "trips") {
    const trips = await listSwitchableTrips({ userId: bound.userId });
    await input.bot.sendMessage({
      chatId,
      text: formatTripListMessage(trips),
      replyMarkup:
        trips.length > 0
          ? buildTripSwitchKeyboard(
              trips.map((trip) => ({ id: trip.id, title: trip.title }))
            )
          : undefined,
    });
    return;
  }

  if (command.kind === "cancel") {
    const state = await getBoundChatState(chatId, bound.userId);
    if (!state?.activeTripId) {
      await input.bot.sendMessage({
        chatId,
        text: "当前没有可取消监控的行程。",
      });
      return;
    }

    try {
      await cancelTripMonitoring({
        tripId: state.activeTripId,
        userId: bound.userId,
      });
    } catch (error) {
      if (error instanceof TripMonitoringNotFoundError) {
        await clearBoundChatState({ chatId, userId: bound.userId });
        await input.bot.sendMessage({
          chatId,
          text: "当前没有可取消监控的行程。",
        });
        return;
      }
      throw error;
    }

    await clearBoundChatState({ chatId, userId: bound.userId });
    await input.bot.sendMessage({
      chatId,
      text: "已取消当前行程监控。",
    });
    return;
  }

  if (command.kind === "status") {
    const state = await getBoundChatState(chatId, bound.userId);
    await input.bot.sendMessage({
      chatId,
      text: state?.activeTripId
        ? `当前行程：${state.activeTripId}`
        : "当前没有正在对话的行程。发送 /new 开始规划。",
    });
    return;
  }

  if (command.kind === "unknown") {
    await input.bot.sendMessage({
      chatId,
      text: "不支持该命令。发送 /start 查看帮助。",
    });
    return;
  }

  await handlePlainText({
    bot: input.bot,
    bridge: input.agentBridge,
    chatId,
    userId: bound.userId,
    text: command.text,
  });
}

async function handleCallbackQuery(input: Required<HandleTelegramUpdateInput>) {
  const callback = input.update.callback_query;
  if (!callback?.message) return;

  const chatId = String(callback.message.chat.id);
  const bound = await resolveCallbackBoundUser({
    chatId,
    callbackQueryId: callback.id,
    bot: input.bot,
  });
  if (!bound) return;

  const action = parseTelegramCallbackData(callback.data);
  if (action.kind === "unknown") {
    await input.bot.answerCallbackQuery({
      callbackQueryId: callback.id,
      text: "这个按钮已不可用。",
    });
    return;
  }

  const result = await switchTelegramActiveTrip({
    chatId,
    userId: bound.userId,
    tripId: action.tripId,
  });

  if (result.status === "not_found") {
    await input.bot.answerCallbackQuery({
      callbackQueryId: callback.id,
      text: "这个行程已不可切换。",
    });
    return;
  }

  await input.bot.answerCallbackQuery({
    callbackQueryId: callback.id,
    text: `已切换到：${result.trip.title}`,
  });
  await sendBestEffort(
    input.bot,
    {
      chatId,
      text: `已切换到：${result.trip.title}。后续普通消息会继续和该行程的 Agent 对话。`,
    },
    "callback switch confirmation"
  );
}

export async function handleTelegramUpdate(
  input: HandleTelegramUpdateInput
): Promise<void> {
  const fullInput: Required<HandleTelegramUpdateInput> = {
    ...input,
    agentBridge: input.agentBridge ?? createTelegramAgentBridge(),
  };

  if (fullInput.update.callback_query) {
    await handleCallbackQuery(fullInput);
    return;
  }

  await handleMessage(fullInput);
}
