export type TelegramTripSummary = {
  title: string;
  status: string;
  scheduledReminderCount: number;
  targetArriveAt?: Date | null;
};

function formatBeijingTime(date?: Date | null) {
  if (!date) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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
