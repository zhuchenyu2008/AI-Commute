import { apiError, apiOk, toPublicError } from "@/lib/http/api";
import { withAuth } from "@/lib/auth/api-guard";
import { runAgentSessionTurn } from "@/lib/agent/session-service";

export async function POST(request: Request) {
  return withAuth(async () => {
    try {
      const body = await request.json().catch(() => ({}));
      const text = String(body.text || "").trim();
      if (!text) {
        return apiError("BAD_REQUEST", "请输入目的地和到达时间", 400);
      }
      const result = await runAgentSessionTurn({ text });
      const assistant = [...result.messages].reverse().find((message) => message.role === "assistant");
      return apiOk({
        message: assistant?.content || "Agent 已处理这次请求。",
        tripId: result.tripId,
        sessionId: result.session.id,
        pendingMemoryCount: result.pendingMemoryCount,
        state: result.tripId ? "planned" : "agentResponded"
      });
    } catch (error) {
      return apiError("SERVICE_UNAVAILABLE", toPublicError(error), 503);
    }
  });
}
