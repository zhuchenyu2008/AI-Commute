import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ tripId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { tripId } = await context.params;
  const deleted = await prisma.trip.deleteMany({
    where: { id: tripId, userId: user.id },
  });

  if (deleted.count !== 1) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 });
  }

  return NextResponse.json({ status: "deleted" });
}
