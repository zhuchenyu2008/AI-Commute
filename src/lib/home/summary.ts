import { formatMemoryKind } from "@/lib/memories/display";

export type HomeTripStatusTone = "neutral" | "success" | "warning" | "danger";

type HomeTripStatusInput = {
  status: string;
  finalStopName?: string | null;
  targetArriveAt?: Date | null;
};

type HistoryTripSummaryInput = {
  title: string;
  status: string;
  finalStopName?: string | null;
};

type LatestMemorySummaryInput = {
  kind: string;
  label: string;
} | null;

const statusLabels: Record<string, string> = {
  cancelled: "已取消",
  completed: "已完成",
  failed: "失败",
  monitoring: "监控中",
  planning: "规划中",
  running: "运行中",
  scheduled: "已计划",
  timed_out: "已超时",
};

const statusTones: Record<string, HomeTripStatusTone> = {
  cancelled: "neutral",
  completed: "neutral",
  failed: "danger",
  monitoring: "success",
  planning: "warning",
  running: "warning",
  scheduled: "success",
  timed_out: "danger",
};

function isExpiredTrip(input: HomeTripStatusInput, now: Date) {
  return Boolean(
    (input.status === "monitoring" || input.status === "scheduled") &&
      input.targetArriveAt &&
      input.targetArriveAt.getTime() < now.getTime()
  );
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
    label: statusLabels[input.status] ?? input.status,
    tone: statusTones[input.status] ?? "neutral",
    title: input.finalStopName ?? "目的地待定",
    description: input.targetArriveAt
      ? `目标到达 ${formatBeijingTime(input.targetArriveAt)}`
      : "等待行程时间确认",
  };
}

export function formatHistoryTripSummary(input: HistoryTripSummaryInput) {
  return `${statusLabels[input.status] ?? input.status} · ${
    input.finalStopName ?? input.title
  }`;
}

export function formatLatestMemorySummary(input: LatestMemorySummaryInput) {
  if (!input) {
    return "暂无已确认记忆";
  }

  return `${formatMemoryKind(input.kind)} · ${input.label}`;
}
