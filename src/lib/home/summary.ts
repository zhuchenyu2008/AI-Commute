import { formatMemoryKind } from "@/lib/memories/display";
import {
  getTripDisplayStatus,
  isExpiredTripStatus,
  TRIP_STATUS_LABELS,
  type TripDisplayTone,
} from "@/lib/trips/display-status";

export type HomeTripStatusTone = TripDisplayTone;

type HomeTripStatusInput = {
  status: string;
  finalStopName?: string | null;
  targetArriveAt?: Date | null;
};

type HistoryTripSummaryInput = {
  title: string;
  status: string;
  finalStopName?: string | null;
  targetArriveAt?: Date | null;
};

type LatestMemorySummaryInput = {
  kind: string;
  label: string;
} | null;

type HomeTripSelectionInput = {
  status: string;
  targetArriveAt?: Date | null;
  updatedAt: Date;
};

const ACTIVE_HOME_TRIP_STATUSES = new Set([
  "monitoring",
  "planning",
  "running",
  "scheduled",
]);

function isExpiredTrip(input: HomeTripStatusInput, now: Date) {
  return isExpiredTripStatus({ ...input, now });
}

function formatBeijingTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export function formatHomeTripStatus(
  input: HomeTripStatusInput | null,
  now = new Date()
) {
  if (!input) {
    return {
      label: "暂无行程",
      tone: "neutral" as const,
      title: "还没有最近行程",
      description: "完成一次规划后会在这里显示实时状态。",
    };
  }

  if (isExpiredTrip(input, now)) {
    return {
      label: "已过期",
      tone: "warning" as const,
      title: input.finalStopName ?? "目的地待定",
      description: input.targetArriveAt
        ? `目标到达 ${formatBeijingTime(input.targetArriveAt)}`
        : "目标到达时间已过",
    };
  }

  return {
    label: TRIP_STATUS_LABELS[input.status] ?? input.status,
    tone: getTripDisplayStatus({ ...input, now }).tone,
    title: input.finalStopName ?? "目的地待定",
    description: input.targetArriveAt
      ? `目标到达 ${formatBeijingTime(input.targetArriveAt)}`
      : "等待行程时间确认",
  };
}

export function formatHistoryTripSummary(
  input: HistoryTripSummaryInput,
  now = new Date()
) {
  const displayStatus = getTripDisplayStatus({ ...input, now });

  return `${displayStatus.label} · ${
    input.finalStopName ?? input.title
  }`;
}

export function formatLatestMemorySummary(input: LatestMemorySummaryInput) {
  if (!input) {
    return "暂无已确认记忆";
  }

  return `${formatMemoryKind(input.kind)} · ${input.label}`;
}

function compareDatesDescending(left: Date, right: Date) {
  return right.getTime() - left.getTime();
}

function compareTripTimeAscending(
  left?: Date | null,
  right?: Date | null
) {
  if (left && right) return left.getTime() - right.getTime();
  if (left) return -1;
  if (right) return 1;
  return 0;
}

export function selectHomeTripForDisplay<T extends HomeTripSelectionInput>(
  trips: readonly T[],
  now = new Date()
): T | null {
  const activeTrips = trips
    .filter(
      (trip) =>
        ACTIVE_HOME_TRIP_STATUSES.has(trip.status) &&
        !isExpiredTripStatus({ ...trip, now })
    )
    .sort((left, right) => {
      const tripTimeDelta = compareTripTimeAscending(
        left.targetArriveAt,
        right.targetArriveAt
      );

      return tripTimeDelta || compareDatesDescending(left.updatedAt, right.updatedAt);
    });

  if (activeTrips[0]) {
    return activeTrips[0];
  }

  return (
    [...trips].sort((left, right) =>
      compareDatesDescending(left.updatedAt, right.updatedAt)
    )[0] ?? null
  );
}
