import { prisma } from "@/lib/db";

export type BoundTelegramUserResult =
  | { status: "unbound"; chatId: string }
  | { status: "ambiguous"; chatId: string }
  | { status: "bound"; chatId: string; user: { id: string } };

export async function findBoundTelegramUser(
  chatId: string
): Promise<BoundTelegramUserResult> {
  const settings = await prisma.userSettings.findMany({
    where: { telegramChatId: chatId },
    select: { userId: true },
    take: 2,
  });

  if (settings.length === 0) return { status: "unbound", chatId };
  if (settings.length > 1) return { status: "ambiguous", chatId };
  return { status: "bound", chatId, user: { id: settings[0].userId } };
}

export async function setTelegramAwaitingNewPrompt(input: {
  chatId: string;
  userId: string;
}) {
  return prisma.telegramChatState.upsert({
    where: { chatId: input.chatId },
    create: {
      chatId: input.chatId,
      userId: input.userId,
      activeAgentSessionId: null,
      activeTripId: null,
      mode: "awaiting_new_prompt",
    },
    update: {
      userId: input.userId,
      activeAgentSessionId: null,
      activeTripId: null,
      mode: "awaiting_new_prompt",
    },
  });
}

export async function setTelegramActiveConversation(input: {
  chatId: string;
  userId: string;
  agentSessionId: string;
  tripId?: string | null;
}) {
  return prisma.telegramChatState.upsert({
    where: { chatId: input.chatId },
    create: {
      chatId: input.chatId,
      userId: input.userId,
      activeAgentSessionId: input.agentSessionId,
      activeTripId: input.tripId ?? null,
      mode: "active",
    },
    update: {
      userId: input.userId,
      activeAgentSessionId: input.agentSessionId,
      activeTripId: input.tripId ?? null,
      mode: "active",
    },
  });
}

export async function getTelegramChatState(chatId: string) {
  return prisma.telegramChatState.findUnique({ where: { chatId } });
}

export async function listSwitchableTrips(input: { userId: string }) {
  const trips = await prisma.trip.findMany({
    where: {
      userId: input.userId,
      status: { not: "cancelled" },
    },
    orderBy: { createdAt: "desc" },
    include: {
      reminderJobs: {
        where: { status: "scheduled" },
        select: { id: true },
      },
    },
  });

  return trips
    .sort((left, right) => {
      if (left.status === "monitoring" && right.status !== "monitoring") {
        return -1;
      }
      if (left.status !== "monitoring" && right.status === "monitoring") {
        return 1;
      }
      return right.createdAt.getTime() - left.createdAt.getTime();
    })
    .slice(0, 10)
    .map((trip) => ({
      id: trip.id,
      title: trip.title,
      status: trip.status,
      targetArriveAt: trip.targetArriveAt,
      scheduledReminderCount: trip.reminderJobs.length,
    }));
}

async function findOrCreateTripAgentSession(input: {
  userId: string;
  tripId: string;
  tripTitle: string;
  tripAgentSessionId?: string | null;
}) {
  if (input.tripAgentSessionId) {
    const byTripScalar = await prisma.agentSession.findFirst({
      where: { id: input.tripAgentSessionId, userId: input.userId },
      orderBy: { createdAt: "desc" },
    });
    if (byTripScalar) return byTripScalar;
  }

  const existing = await prisma.agentSession.findFirst({
    where: { userId: input.userId, tripId: input.tripId },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return prisma.agentSession.create({
    data: {
      userId: input.userId,
      tripId: input.tripId,
      status: "completed",
      purpose: "telegram_continuation",
      prompt: `Telegram 选择已有行程继续对话：${input.tripTitle}`,
      messages: {
        create: {
          role: "assistant",
          content: "已从 Telegram 绑定到已有行程。",
        },
      },
    },
  });
}

export async function switchTelegramActiveTrip(input: {
  chatId: string;
  userId: string;
  tripId: string;
}) {
  const trip = await prisma.trip.findFirst({
    where: {
      id: input.tripId,
      userId: input.userId,
      status: { not: "cancelled" },
    },
  });

  if (!trip) {
    return { status: "not_found" as const };
  }

  const session = await findOrCreateTripAgentSession({
    userId: input.userId,
    tripId: trip.id,
    tripTitle: trip.title,
    tripAgentSessionId: trip.agentSessionId,
  });

  await setTelegramActiveConversation({
    chatId: input.chatId,
    userId: input.userId,
    agentSessionId: session.id,
    tripId: trip.id,
  });

  return {
    status: "switched" as const,
    trip: { id: trip.id, title: trip.title },
    agentSessionId: session.id,
  };
}

export async function getNextTelegramOffset() {
  const state = await prisma.telegramBotState.findUnique({
    where: { id: "default" },
  });
  return state?.lastUpdateId === null || state?.lastUpdateId === undefined
    ? undefined
    : state.lastUpdateId + 1;
}

export async function markTelegramUpdateProcessed(updateId: number) {
  return prisma.telegramBotState.upsert({
    where: { id: "default" },
    create: { id: "default", lastUpdateId: updateId },
    update: { lastUpdateId: updateId },
  });
}
