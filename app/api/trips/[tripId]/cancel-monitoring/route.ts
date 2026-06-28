import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  cancelTripMonitoring,
  TripMonitoringNotFoundError,
} from "@/lib/trips/monitoring";

type RouteContext = {
  params: Promise<{ tripId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { tripId } = await context.params;

  try {
    const trip = await cancelTripMonitoring({ tripId, userId: user.id });
    return NextResponse.json({ status: trip.status });
  } catch (error) {
    if (error instanceof TripMonitoringNotFoundError) {
      return NextResponse.json({ error: "行程不存在" }, { status: 404 });
    }

    return NextResponse.json({ error: "取消监控失败" }, { status: 500 });
  }
}
