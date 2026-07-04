import { NextResponse } from "next/server";
import { createAmapClient } from "@/lib/amap";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readEnv } from "@/lib/env";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
  });
  const env = readEnv();
  const city =
    url.searchParams.get("city")?.trim() ||
    settings?.defaultCity ||
    env.defaultCity;

  try {
    const weather = await createAmapClient().getWeather({ city });

    return NextResponse.json({ weather });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";

    return NextResponse.json(
      { error: `天气更新失败：${detail}` },
      { status: 502 }
    );
  }
}
