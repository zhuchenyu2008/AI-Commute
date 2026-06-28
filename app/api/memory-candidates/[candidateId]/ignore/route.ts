import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ignoreMemoryCandidate } from "@/lib/memories/actions";

type RouteContext = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { candidateId } = await context.params;

  try {
    const result = await ignoreMemoryCandidate({ candidateId, userId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "忽略记忆失败" },
      { status: 404 }
    );
  }
}
