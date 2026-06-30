import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  findBoundTelegramUser,
  getNextTelegramOffset,
  listSwitchableTrips,
  markTelegramUpdateProcessed,
  setTelegramAwaitingNewPrompt,
  switchTelegramActiveTrip,
} from "@/lib/telegram/state";
import { createPlannedTrip } from "@/lib/trips/create-trip";
import { ensureTestDatabase } from "./test-db";

describe("telegram state service", () => {
  beforeAll(async () => {
    await ensureTestDatabase();
  });

  it("resolves unbound, bound, and ambiguous chat ids", async () => {
    const chatId = `chat-${Date.now()}`;
    await expect(findBoundTelegramUser(chatId)).resolves.toMatchObject({
      status: "unbound",
      chatId,
    });

    const user = await createTelegramUser("bound", chatId);
    await expect(findBoundTelegramUser(chatId)).resolves.toMatchObject({
      status: "bound",
      chatId,
      user: { id: user.id },
    });

    await createTelegramUser("ambiguous", chatId);
    await expect(findBoundTelegramUser(chatId)).resolves.toMatchObject({
      status: "ambiguous",
      chatId,
    });
  });

  it("stores awaiting new prompt state", async () => {
    const chatId = `awaiting-${Date.now()}`;
    const user = await createTelegramUser("awaiting", chatId);

    const state = await setTelegramAwaitingNewPrompt({ chatId, userId: user.id });

    expect(state).toMatchObject({
      chatId,
      userId: user.id,
      mode: "awaiting_new_prompt",
      activeAgentSessionId: null,
      activeTripId: null,
    });
  });

  it("lists switchable trips with monitoring trips first", async () => {
    const chatId = `trips-${Date.now()}`;
    const user = await createTelegramUser("trips", chatId);
    const monitoring = await createTrip(user.id, "家-外事学校", "monitoring");
    await createTrip(user.id, "家-取消", "cancelled");
    const completed = await createTrip(user.id, "家-天街", "completed");

    const trips = await listSwitchableTrips({ userId: user.id });

    expect(trips.map((trip) => trip.id)).toEqual([
      monitoring.id,
      completed.id,
    ]);
    expect(trips[0]).toMatchObject({
      title: "家-外事学校",
      scheduledReminderCount: expect.any(Number),
    });
  });

  it("switches active trip and bootstraps an agent session when needed", async () => {
    const chatId = `switch-${Date.now()}`;
    const user = await createTelegramUser("switch", chatId);
    const trip = await createTrip(user.id, "家-图书馆", "monitoring");

    const result = await switchTelegramActiveTrip({
      chatId,
      userId: user.id,
      tripId: trip.id,
    });

    expect(result).toMatchObject({
      status: "switched",
      trip: { id: trip.id, title: "家-图书馆" },
      agentSessionId: expect.any(String),
    });
    await expect(
      prisma.telegramChatState.findUniqueOrThrow({ where: { chatId } })
    ).resolves.toMatchObject({
      activeTripId: trip.id,
      activeAgentSessionId: result.agentSessionId,
      mode: "active",
    });
  });

  it("stores and returns the next Telegram offset", async () => {
    await markTelegramUpdateProcessed(42);
    await expect(getNextTelegramOffset()).resolves.toBe(43);
  });
});

async function createTelegramUser(label: string, chatId: string) {
  return prisma.user.create({
    data: {
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      name: label,
      passwordHash: "hash",
      settings: {
        create: {
          defaultCity: "宁波",
          timezone: "Asia/Shanghai",
          originName: "家",
          originLngLat: "121.1,29.1",
          routePreference: "balanced",
          telegramChatId: chatId,
        },
      },
    },
  });
}

async function createTrip(userId: string, title: string, status: string) {
  const trip = await createPlannedTrip({
    userId,
    rawPrompt: title,
    timezone: "Asia/Shanghai",
    title,
    finalStopName: title.split("-").at(-1),
    targetArriveAt: new Date("2026-07-01T01:00:00.000Z"),
    stops: [{ order: 1, name: title.split("-").at(-1) ?? title }],
    legs: [
      {
        order: 1,
        originName: "家",
        originLngLat: "121.1,29.1",
        destinationName: title.split("-").at(-1) ?? title,
        destinationLngLat: "121.2,29.2",
        routeMinutes: 20,
        bufferComponents: [
          {
            category: "transfer",
            label: "换乘",
            minutes: 5,
            reason: "预留换乘时间。",
          },
        ],
      },
    ],
  });

  return prisma.trip.update({ where: { id: trip.id }, data: { status } });
}
