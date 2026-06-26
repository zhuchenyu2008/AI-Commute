import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  reminderJob: {
    findMany: vi.fn(),
    update: vi.fn()
  }
}));

const runScheduledAgentTurnMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: prismaMock
}));

vi.mock("@/lib/agent/scheduled-turn", () => ({
  runScheduledAgentTurn: runScheduledAgentTurnMock
}));

describe("route watch scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs due reminder jobs through a scheduled agent turn", async () => {
    prismaMock.reminderJob.findMany.mockResolvedValue([
      {
        id: "job-1",
        tripId: "trip-1",
        agentSessionId: "session-1",
        kind: "route-watch",
        payloadJson: JSON.stringify({ purpose: "recheck route" }),
        trip: { id: "trip-1", destinationName: "龙湖天街" }
      }
    ]);
    prismaMock.reminderJob.update.mockResolvedValue({});
    runScheduledAgentTurnMock.mockResolvedValue({ ok: true });

    const { runDueRouteWatchJobs } = await import("@/lib/scheduler/route-watch");
    const count = await runDueRouteWatchJobs(new Date("2026-06-27T00:00:00.000Z"));

    expect(count).toBe(1);
    expect(runScheduledAgentTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        tripId: "trip-1",
        sessionId: "session-1",
        payload: { purpose: "recheck route" }
      })
    );
    expect(prismaMock.reminderJob.update).toHaveBeenLastCalledWith({
      where: { id: "job-1" },
      data: { status: "done", ranAt: expect.any(Date) }
    });
  });
});
