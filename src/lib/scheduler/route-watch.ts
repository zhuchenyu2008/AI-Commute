import { prisma } from "@/lib/db";
import { runScheduledAgentTurn } from "@/lib/agent/scheduled-turn";

let schedulerStarted = false;

export function startRouteWatchScheduler() {
  if (schedulerStarted) {
    return;
  }
  schedulerStarted = true;
  setInterval(() => {
    runDueRouteWatchJobs().catch((error) => {
      console.error("[scheduler] route-watch failed", error);
    });
  }, 60_000);
}

export async function runDueRouteWatchJobs(now = new Date()) {
  const jobs = await prisma.reminderJob.findMany({
    where: {
      status: "pending",
      scheduledAt: { lte: now }
    },
    include: { trip: true },
    take: 10,
    orderBy: { scheduledAt: "asc" }
  });

  for (const job of jobs) {
    try {
      await prisma.reminderJob.update({ where: { id: job.id }, data: { status: "running" } });
      await runScheduledAgentTurn({
        jobId: job.id,
        tripId: job.tripId,
        sessionId: job.agentSessionId,
        payload: safeJson(job.payloadJson || "{}")
      });
      await prisma.reminderJob.update({ where: { id: job.id }, data: { status: "done", ranAt: new Date() } });
    } catch (error) {
      await prisma.reminderJob.update({
        where: { id: job.id },
        data: { status: "failed", lastError: error instanceof Error ? error.message : String(error), ranAt: new Date() }
      });
    }
  }

  return jobs.length;
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
