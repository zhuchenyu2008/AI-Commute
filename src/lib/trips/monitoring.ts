import { prisma } from "@/lib/db";

export class TripMonitoringNotFoundError extends Error {
  constructor() {
    super("Trip not found.");
    this.name = "TripMonitoringNotFoundError";
  }
}

export type FormatMonitoredDurationInput = {
  createdAt: Date;
  now?: Date;
};

export type MonitoringSummaryInput = FormatMonitoredDurationInput & {
  scheduledReminderCount: number;
};

export function formatMonitoredDuration({
  createdAt,
  now = new Date(),
}: FormatMonitoredDurationInput) {
  const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
  const totalMinutes = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}分钟`;
  }

  if (minutes === 0) {
    return `${hours}小时`;
  }

  return `${hours}小时${minutes}分钟`;
}

export function getMonitoringSummary({
  createdAt,
  now,
  scheduledReminderCount,
}: MonitoringSummaryInput) {
  return {
    monitoredFor: formatMonitoredDuration({ createdAt, now }),
    scheduledReminderCount,
  };
}

export async function cancelTripMonitoring(input: {
  tripId: string;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id: input.tripId, userId: input.userId },
      select: { id: true },
    });

    if (!trip) {
      throw new TripMonitoringNotFoundError();
    }

    await tx.reminderJob.updateMany({
      where: { tripId: trip.id, status: "scheduled" },
      data: { status: "cancelled" },
    });
    await tx.tripLeg.updateMany({
      where: { tripId: trip.id },
      data: { status: "cancelled" },
    });

    return tx.trip.update({
      where: { id: trip.id },
      data: { status: "cancelled" },
    });
  });
}
