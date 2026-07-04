import { sanitizeAgentVisibleReply } from "@/lib/agent/plain-text";

export type AgentMessageEventSource = {
  id: string;
  role: string;
  content: string;
  createdAt: string | Date;
};

export type AgentToolCallEventSource = {
  id: string;
  name: string;
  status: string;
  durationMs?: number | null;
  error?: string | null;
  createdAt: string | Date;
};

export type AgentEvent = {
  id: string;
  kind: "message" | "tool";
  title: string;
  detail: string;
  status: string;
  createdAt: string | Date;
};

const VISIBLE_MESSAGE_ROLES = new Set(["assistant", "user"]);

export function formatAgentToolName(name: string) {
  const labels: Record<string, string> = {
    cancel_trip_monitoring: "取消行程监控",
    create_memory_candidate: "记录记忆候选",
    create_trip: "创建行程",
    get_bicycling_route: "查询骑行路线",
    get_poi_detail: "读取地点详情",
    get_transit_route: "查询公交/地铁路线",
    get_walking_route: "查询步行路线",
    get_weather_reference: "获取天气参考",
    read_current_trip: "读取当前行程",
    read_memories: "读取记忆",
    read_settings: "读取设置",
    replace_reminder_schedule: "更新提醒计划",
    replace_trip_legs: "更新路线段",
    replace_trip_stops: "更新停靠点",
    search_poi: "搜索地点",
    select_route_candidate: "选择路线方案",
    update_trip_summary: "更新行程摘要",
  };

  return labels[name] ?? "工具调用";
}

export function formatAgentEventStatus(status: string) {
  const labels: Record<string, string> = {
    assistant: "智能体",
    cancelled: "已取消",
    completed: "已完成",
    failed: "失败",
    loading: "加载中",
    pending: "等待中",
    running: "运行中",
    timed_out: "已超时",
    tool: "工具",
    user: "用户",
  };

  return labels[status] ?? status;
}

export function buildAgentEvents(session: {
  messages: AgentMessageEventSource[];
  toolCalls: AgentToolCallEventSource[];
}): AgentEvent[] {
  return [
    ...session.messages
      .filter((message) => VISIBLE_MESSAGE_ROLES.has(message.role))
      .map((message) => ({
        id: `message-${message.id}`,
        kind: "message" as const,
        title: message.role === "assistant" ? "智能体更新" : "用户请求",
        detail:
          message.role === "assistant"
            ? sanitizeAgentVisibleReply(message.content)
            : message.content,
        status: message.role,
        createdAt: message.createdAt,
      })),
    ...session.toolCalls.map((tool) => ({
      id: `tool-${tool.id}`,
      kind: "tool" as const,
      title: formatAgentToolName(tool.name),
      detail:
        tool.error ??
        (tool.durationMs ? `${tool.durationMs} 毫秒` : "已记录工具调用"),
      status: tool.status,
      createdAt: tool.createdAt,
    })),
  ].sort((left, right) => {
    const timeDelta =
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

    return timeDelta || left.id.localeCompare(right.id);
  });
}
