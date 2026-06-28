import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  runPlanningSession,
  startPlanningSession,
} from "@/lib/agent/planner";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return NextResponse.json(
      { error: "请输入通勤规划需求" },
      { status: 400 }
    );
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
  });
  if (!settings?.originName?.trim() || !settings.originLngLat?.trim()) {
    return NextResponse.json(
      {
        error:
          "请先在设置中选择默认出发点，再开始智能体规划。",
        actionHref: "/settings",
      },
      { status: 400 }
    );
  }

  const session = await startPlanningSession({
    userId: user.id,
    prompt,
  });

  void runPlanningSession(session.id);

  return NextResponse.json({
    sessionId: session.id,
    status: session.status,
  });
}
