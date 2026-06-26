import { prisma } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent/runner";
import { serializeAgentMessage, serializeAgentToolCall } from "@/lib/trips/serialize";

export async function runAgentSessionTurn(input: { text: string; sessionId?: string; tripId?: string | null }) {
  const text = input.text.trim();
  if (!text) {
    throw new Error("请输入要交给 Agent 的内容");
  }

  const session = input.sessionId
    ? await prisma.agentSession.findUniqueOrThrow({ where: { id: input.sessionId } })
    : await prisma.agentSession.create({
        data: {
          title: buildSessionTitle(text),
          status: "active",
          tripId: input.tripId || undefined,
          metadataJson: JSON.stringify({ createdBy: "agent" })
        }
      });

  const userMessage = await prisma.agentMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: text,
      metadataJson: JSON.stringify({ source: "web" })
    }
  });

  const result = await runAgentTurn({
    sessionId: session.id,
    userText: text,
    context: { tripId: input.tripId || session.tripId }
  });

  const nextTripId = result.tripId || input.tripId || session.tripId || null;
  const assistantMessage = await prisma.agentMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: result.assistantMessage,
      metadataJson: JSON.stringify({
        toolCallCount: result.toolCalls.length,
        tripId: nextTripId
      })
    }
  });

  const updatedSession = await prisma.agentSession.update({
    where: { id: session.id },
    data: {
      tripId: nextTripId || undefined,
      status: nextTripId ? "active" : session.status
    }
  });

  const toolCalls = await prisma.agentToolCall.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" }
  });

  return {
    session: updatedSession,
    messages: [userMessage, assistantMessage].map(serializeAgentMessage),
    toolCalls: toolCalls.map(serializeAgentToolCall),
    tripId: nextTripId,
    pendingMemoryCount: await prisma.memory.count({ where: { status: "pending", deletedAt: null } })
  };
}

export async function getAgentSession(sessionId: string) {
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId }
  });
  if (!session) {
    return null;
  }
  const [messages, toolCalls] = await Promise.all([
    prisma.agentMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" }
    }),
    prisma.agentToolCall.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" }
    })
  ]);
  return {
    session,
    messages: messages.map(serializeAgentMessage),
    toolCalls: toolCalls.map(serializeAgentToolCall),
    tripId: session.tripId
  };
}

function buildSessionTitle(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact || "Agent 会话";
}
