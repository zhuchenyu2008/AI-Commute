import { prisma } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent/runner";

export async function runScheduledAgentTurn(input: {
  jobId: string;
  tripId: string;
  sessionId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const sessionId = input.sessionId || (await ensureSessionForTrip(input.tripId));
  const trip = await prisma.trip.findUnique({
    where: { id: input.tripId },
    include: { routeOptions: true, segments: true, reminderJobs: true }
  });
  if (!trip) {
    throw new Error("Trip not found for scheduled agent turn");
  }

  const content = [
    `Scheduled route-watch job ${input.jobId}.`,
    `Destination: ${trip.destinationName}.`,
    `Latest departure: ${trip.latestDepartLocal || "unknown"}.`,
    "Decide whether to recheck, notify, update reminders, or simply record no change."
  ].join(" ");

  await prisma.agentMessage.create({
    data: {
      sessionId,
      role: "system",
      content,
      metadataJson: JSON.stringify({
        kind: "scheduled-route-watch",
        jobId: input.jobId,
        tripId: input.tripId,
        payload: input.payload || {}
      })
    }
  });

  const result = await runAgentTurn({
    sessionId,
    userText: content,
    context: {
      scheduled: true,
      tripId: input.tripId,
      jobId: input.jobId,
      payload: input.payload || {}
    }
  });

  await prisma.agentMessage.create({
    data: {
      sessionId,
      role: "assistant",
      content: result.assistantMessage,
      metadataJson: JSON.stringify({
        kind: "scheduled-route-watch-result",
        jobId: input.jobId,
        tripId: result.tripId || input.tripId
      })
    }
  });

  return result;
}

async function ensureSessionForTrip(tripId: string) {
  const existing = await prisma.agentSession.findFirst({
    where: { tripId },
    orderBy: { createdAt: "desc" }
  });
  if (existing) {
    return existing.id;
  }
  const session = await prisma.agentSession.create({
    data: {
      tripId,
      status: "active",
      title: "行程复算 Agent",
      metadataJson: JSON.stringify({ createdBy: "scheduler" })
    }
  });
  return session.id;
}
