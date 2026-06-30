import type { AgentEvent } from "@/lib/agent/events";
import { formatAgentEventStatus } from "@/lib/agent/events";
import {
  formatReminderStatus,
  getMonitoringStatusDisplay,
} from "@/lib/trips/monitoring";

export type TelegramTripSummary = {
  title: string;
  status: string;
  scheduledReminderCount: number;
  targetArriveAt?: Date | null;
};

export type TelegramFinalTripPlan = {
  title: string;
  status: string;
  targetArriveAt?: Date | null;
  createdAt: Date;
  legs: TelegramFinalTripLeg[];
  reminderJobs: TelegramFinalTripReminder[];
  latestRecalculation?: {
    status?: string | null;
    summary?: string | null;
    trigger?: string | null;
  } | null;
};

export type TelegramFinalTripLeg = {
  id?: string;
  originName: string;
  destinationName: string;
  latestDepartAt?: Date | null;
  targetArriveAt?: Date | null;
  selectedCandidate?: TelegramFinalTripCandidate | null;
  routeSegments: TelegramFinalTripSegment[];
  bufferComponents: TelegramFinalTripBuffer[];
};

export type TelegramFinalTripCandidate = {
  title: string;
  routeMinutes: number;
  bufferMinutes: number;
  totalMinutes: number;
  rationale?: string | null;
};

export type TelegramFinalTripSegment = {
  title: string;
  detail?: string | null;
  minutes: number;
  mode: string;
};

export type TelegramFinalTripBuffer = {
  label: string;
  minutes: number;
  reason: string;
  category: string;
  source?: string | null;
};

export type TelegramFinalTripReminder = {
  kind: string;
  status?: string | null;
  scheduledFor: Date;
};

const TELEGRAM_MESSAGE_LIMIT = 3500;

function formatBeijingTime(date?: Date | null) {
  if (!date) return "未设置";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

  return `${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
}

function isWeatherBuffer(buffer: TelegramFinalTripBuffer) {
  return (
    buffer.category.toLowerCase().includes("weather") ||
    buffer.source === "weather_context"
  );
}

function formatReminderKind(kind: string) {
  const labels: Record<string, string> = {
    depart_now: "现在出发",
    recheck: "路线复查",
  };

  return labels[kind] ?? kind;
}

export function splitTelegramMessage(
  text: string,
  limit = TELEGRAM_MESSAGE_LIMIT
) {
  const normalized = text.trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = "";

  for (const line of normalized.split(/\r?\n/)) {
    if (line.length > limit) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = "";
      }

      for (let index = 0; index < line.length; index += limit) {
        chunks.push(line.slice(index, index + limit));
      }
      continue;
    }

    const next = current ? `${current}\n${line}` : line;
    if (next.length > limit) {
      if (current.trim()) chunks.push(current.trim());
      current = line;
    } else {
      current = next;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((chunk) => chunk.length > 0);
}

export function formatTelegramAgentEvent(event: AgentEvent) {
  if (event.kind === "tool") {
    return [
      `工具调用：${event.title}`,
      `状态：${formatAgentEventStatus(event.status)}`,
      event.detail,
    ].join("\n");
  }

  return [event.title, event.detail].filter(Boolean).join("\n");
}

function formatTripLegSummary(leg: TelegramFinalTripLeg, index: number) {
  const candidate = leg.selectedCandidate;
  const lines = [
    `第 ${index + 1} 段：${leg.originName} 到 ${leg.destinationName}`,
    `出发：${formatBeijingTime(leg.latestDepartAt)} / 到达：${formatBeijingTime(
      leg.targetArriveAt
    )}`,
  ];

  if (candidate) {
    lines.push(
      `方案：${candidate.title}，路程 ${candidate.routeMinutes} 分钟 + 缓冲 ${candidate.bufferMinutes} 分钟`
    );
    if (candidate.rationale) {
      lines.push(`理由：${candidate.rationale}`);
    }
  }

  for (const segment of leg.routeSegments) {
    lines.push(
      `- ${segment.title}（${segment.minutes} 分钟）${
        segment.detail ? `：${segment.detail}` : ""
      }`
    );
  }

  return lines.join("\n");
}

function formatTripBuffer(buffer: TelegramFinalTripBuffer) {
  if (isWeatherBuffer(buffer) && buffer.minutes === 0) {
    return `${buffer.label}：0 分钟，仅作天气参考。${buffer.reason}`;
  }

  if (isWeatherBuffer(buffer)) {
    return `${buffer.label}：${buffer.minutes} 分钟，天气影响缓冲。${buffer.reason}`;
  }

  return `${buffer.label}：${buffer.minutes} 分钟。${buffer.reason}`;
}

export function formatFinalTripPlanMessage(trip: TelegramFinalTripPlan) {
  const selectedCandidates = trip.legs.flatMap((leg) =>
    leg.selectedCandidate ? [leg.selectedCandidate] : []
  );
  const totalRouteMinutes = selectedCandidates.reduce(
    (sum, candidate) => sum + candidate.routeMinutes,
    0
  );
  const totalBufferMinutes = selectedCandidates.reduce(
    (sum, candidate) => sum + candidate.bufferMinutes,
    0
  );
  const earliestDepartAt = trip.legs
    .map((leg) => leg.latestDepartAt)
    .filter((date): date is Date => date instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const buffers = trip.legs.flatMap((leg) =>
    leg.bufferComponents.map((buffer) => ({
      ...buffer,
      label:
        trip.legs.length > 1
          ? `${leg.destinationName}: ${buffer.label}`
          : buffer.label,
    }))
  );
  const monitoring = getMonitoringStatusDisplay({
    tripStatus: trip.status,
    targetArriveAt: trip.targetArriveAt,
    latestRecalculation: trip.latestRecalculation,
  });

  return [
    "最终行程计划",
    `标题：${trip.title}`,
    `目标到达：${formatBeijingTime(trip.targetArriveAt)}`,
    `最晚出发：${formatBeijingTime(earliestDepartAt)}`,
    `总路程 ${totalRouteMinutes} 分钟 + 缓冲 ${totalBufferMinutes} 分钟`,
    "",
    "路线分段",
    ...trip.legs.map(formatTripLegSummary),
    "",
    "缓冲时间",
    ...(buffers.length > 0 ? buffers.map(formatTripBuffer) : ["暂无缓冲项目。"]),
    "",
    "提醒计划",
    ...(trip.reminderJobs.length > 0
      ? trip.reminderJobs.map(
          (reminder) =>
            `${formatReminderKind(reminder.kind)}：${formatBeijingTime(
              reminder.scheduledFor
            )}，${formatReminderStatus({
              status: reminder.status,
              kind: reminder.kind,
              scheduledFor: reminder.scheduledFor,
            })}`
        )
      : ["暂无提醒计划。"]),
    "",
    `监控状态：${monitoring.title}`,
    monitoring.description,
  ].join("\n");
}

export function formatBoundHelpMessage(input: { hasActiveTrip: boolean }) {
  const active = input.hasActiveTrip
    ? "当前已有绑定行程，直接发消息即可继续和 Agent 对话。"
    : "当前没有绑定行程，发送 /new 加出行需求即可开始。";

  return [
    "通勤规划助手已连接。",
    active,
    "可用命令：",
    "/new 明天九点到外事学校",
    "/trips 切换当前行程",
    "/status 查看当前行程",
    "/cancel 取消当前行程监控",
  ].join("\n");
}

export function formatTripSummaryLine(input: TelegramTripSummary) {
  return [
    input.title,
    `状态：${input.status}`,
    `目标到达：${formatBeijingTime(input.targetArriveAt)}`,
    `待提醒：${input.scheduledReminderCount}`,
  ].join("｜");
}

export function formatTripListMessage(trips: TelegramTripSummary[]) {
  if (trips.length === 0) {
    return "最近没有可切换的行程。";
  }

  return ["请选择要继续对话的行程：", ...trips.map(formatTripSummaryLine)].join(
    "\n"
  );
}

export function formatUnboundMessage(chatId: string) {
  return `请先在网站设置页填写 Telegram Chat ID: ${chatId}`;
}
