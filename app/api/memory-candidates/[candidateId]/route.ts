import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  deleteMemoryCandidate,
  MemoryCandidateNotFoundError,
} from "@/lib/memories/actions";

type RouteContext = {
  params: Promise<{ candidateId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { candidateId } = await context.params;

  try {
    return NextResponse.json(
      await deleteMemoryCandidate({ candidateId, userId: user.id })
    );
  } catch (error) {
    if (error instanceof MemoryCandidateNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ error: "删除记忆候选失败" }, { status: 500 });
  }
}
