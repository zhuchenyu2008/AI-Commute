import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { deleteMemory, MemoryNotFoundError } from "@/lib/memories/actions";

type RouteContext = {
  params: Promise<{ memoryId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { memoryId } = await context.params;

  try {
    return NextResponse.json(await deleteMemory({ memoryId, userId: user.id }));
  } catch (error) {
    if (error instanceof MemoryNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ error: "删除记忆失败" }, { status: 500 });
  }
}
