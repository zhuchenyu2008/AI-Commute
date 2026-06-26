import { apiError, apiOk, toPublicError } from "@/lib/http/api";
import { withAuth } from "@/lib/auth/api-guard";
import { getAgentSession } from "@/lib/agent/session-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withAuth(async () => {
    try {
      const { id } = await context.params;
      const result = await getAgentSession(id);
      if (!result) {
        return apiError("NOT_FOUND", "Agent 会话不存在", 404);
      }
      return apiOk({ sessionId: id, ...result });
    } catch (error) {
      return apiError("SERVICE_UNAVAILABLE", toPublicError(error), 503);
    }
  });
}
