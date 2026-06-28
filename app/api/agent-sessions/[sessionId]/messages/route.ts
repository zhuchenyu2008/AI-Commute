import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  AgentSessionAlreadyRunningError,
  AgentSessionNotFoundError,
  acceptAgentSessionMessage,
  runAcceptedContinuationSession,
} from "@/lib/agent/planner";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json(
      { error: "请输入要发送给智能体的消息" },
      { status: 400 }
    );
  }

  try {
    await acceptAgentSessionMessage({
      userId: user.id,
      sessionId,
      message,
    });
  } catch (error) {
    if (error instanceof AgentSessionNotFoundError) {
      return NextResponse.json({ error: "未找到智能体会话" }, { status: 404 });
    }

    if (error instanceof AgentSessionAlreadyRunningError) {
      return NextResponse.json(
        { error: "智能体会话正在运行，请稍后再发送消息" },
        { status: 409 }
      );
    }

    throw error;
  }

  void runAcceptedContinuationSession(sessionId).catch(async (error) => {
    if (
      error instanceof AgentSessionNotFoundError ||
      error instanceof AgentSessionAlreadyRunningError
    ) {
      return;
    }

    await prisma.agentSession
      .update({
        where: { id: sessionId },
        data: {
          status: "failed",
          messages: {
            create: {
              role: "assistant",
              content:
                error instanceof Error
                  ? `规划失败：${error.message}`
                  : "规划失败：请稍后重试。",
            },
          },
        },
      })
      .catch(() => undefined);
  });

  return NextResponse.json({ status: "running" }, { status: 202 });
}
