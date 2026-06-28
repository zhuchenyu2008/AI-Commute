import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { continueAgentSession } from "@/lib/agent/planner";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json(
      { error: "Please enter a message." },
      { status: 400 }
    );
  }

  void continueAgentSession({
    userId: user.id,
    sessionId,
    message,
  });

  return NextResponse.json({ status: "running" }, { status: 202 });
}
