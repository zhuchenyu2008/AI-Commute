import {
  acceptAgentSessionMessage,
  runAcceptedContinuationSession,
  runPlanningSession,
  startPlanningSession,
} from "@/lib/agent/planner";
import type { AmapClient } from "@/lib/amap";
import type { AgentChatClient } from "@/lib/agent/chat-client";
import { buildAgentEvents } from "@/lib/agent/events";
import { prisma } from "@/lib/db";
import { formatTelegramAgentEvent } from "./messages";

const PROGRESS_POLL_INTERVAL_MS = 1000;

export type TelegramAgentProgress = {
  onSessionStarted?(sessionId: string): Promise<void> | void;
  onProgressMessage?(text: string): Promise<void> | void;
};

export type TelegramAgentBridgeOptions = {
  amapClient?: AmapClient;
  chatClient?: AgentChatClient;
};

export type TelegramAgentBridge = {
  startPlanning(input: {
    userId: string;
    prompt: string;
    progress?: TelegramAgentProgress;
  }): Promise<{
    sessionId: string;
    tripId: string | null;
    summary: string;
  }>;
  continueSession(input: {
    userId: string;
    sessionId: string;
    message: string;
    progress?: TelegramAgentProgress;
  }): Promise<{ sessionId: string; tripId: string | null; summary: string }>;
};

async function getLatestAssistantSummary(agentSessionId: string) {
  const message = await prisma.agentMessage.findFirst({
    where: { agentSessionId, role: "assistant" },
    orderBy: { createdAt: "desc" },
  });

  return message?.content ?? "智能体处理完成。";
}

async function loadAgentEventSignatures(agentSessionId: string) {
  const session = await prisma.agentSession.findUnique({
    where: { id: agentSessionId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      toolCalls: { orderBy: { createdAt: "asc" } },
    },
  });

  const signatures = new Map<string, string>();
  if (!session) return signatures;

  for (const event of buildAgentEvents(session)) {
    signatures.set(event.id, `${event.status}\u0000${event.detail}`);
  }

  return signatures;
}

async function emitTimelineProgress(input: {
  sessionId: string;
  progress?: TelegramAgentProgress;
  sentSignatures: Map<string, string>;
}) {
  if (!input.progress?.onProgressMessage) return;

  const session = await prisma.agentSession.findUnique({
    where: { id: input.sessionId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      toolCalls: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) return;

  for (const event of buildAgentEvents(session)) {
    const signature = `${event.status}\u0000${event.detail}`;
    if (input.sentSignatures.get(event.id) === signature) {
      continue;
    }

    input.sentSignatures.set(event.id, signature);
    await input.progress.onProgressMessage(formatTelegramAgentEvent(event));
  }
}

async function runWithRealtimeProgress<T>(input: {
  sessionId: string;
  progress?: TelegramAgentProgress;
  sentSignatures?: Map<string, string>;
  run(): Promise<T>;
}) {
  if (!input.progress?.onProgressMessage) {
    return input.run();
  }

  const sentSignatures = input.sentSignatures ?? new Map<string, string>();
  let polling = false;

  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      await emitTimelineProgress({
        sessionId: input.sessionId,
        progress: input.progress,
        sentSignatures,
      });
    } catch (error) {
      console.error("Telegram agent progress emit failed.", error);
    } finally {
      polling = false;
    }
  };

  void poll();
  const interval = setInterval(() => {
    void poll();
  }, PROGRESS_POLL_INTERVAL_MS);

  try {
    return await input.run();
  } finally {
    clearInterval(interval);
    await poll();
  }
}

export function createTelegramAgentBridge(
  options: TelegramAgentBridgeOptions = {}
): TelegramAgentBridge {
  return {
    async startPlanning({ userId, prompt, progress }) {
      const session = await startPlanningSession({ userId, prompt });
      await progress?.onSessionStarted?.(session.id);
      const result = await runWithRealtimeProgress({
        sessionId: session.id,
        progress,
        run: () => runPlanningSession(session.id, options),
      });
      const summary = await getLatestAssistantSummary(session.id);

      return {
        sessionId: session.id,
        tripId: result.tripId ?? null,
        summary,
      };
    },
    async continueSession({ userId, sessionId, message, progress }) {
      const sentSignatures = await loadAgentEventSignatures(sessionId);
      const session = await acceptAgentSessionMessage({
        userId,
        sessionId,
        message,
      });
      const result = await runWithRealtimeProgress({
        sessionId: session.id,
        progress,
        sentSignatures,
        run: () => runAcceptedContinuationSession(session.id, options),
      });
      const summary = await getLatestAssistantSummary(session.id);

      return {
        sessionId: session.id,
        tripId: result.tripId ?? null,
        summary,
      };
    },
  };
}
