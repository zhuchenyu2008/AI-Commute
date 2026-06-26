import { apiError, apiOk, toPublicError } from "@/lib/http/api";
import { withAuth } from "@/lib/auth/api-guard";
import { runAgentSessionTurn } from "@/lib/agent/session-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withAuth(async () => {
    try {
      const { id } = await context.params;
      const body = await request.json().catch(() => ({}));
      const text = String(body.text || "").trim();
      if (!text) {
        return apiError("BAD_REQUEST", "请输入要交给 Agent 的内容", 400);
      }
      const result = await runAgentSessionTurn({ sessionId: id, text });
      return apiOk({ sessionId: result.session.id, ...result });
    } catch (error) {
      return apiError("SERVICE_UNAVAILABLE", toPublicError(error), 503);
    }
  });
}
