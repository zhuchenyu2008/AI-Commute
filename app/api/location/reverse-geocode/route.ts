import { NextResponse } from "next/server";
import { createAmapClient } from "@/lib/amap";
import { getCurrentUser } from "@/lib/auth/session";

function readCoordinate(url: URL, key: "lng" | "lat") {
  const value = Number(url.searchParams.get(key));

  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const lng = readCoordinate(url, "lng");
  const lat = readCoordinate(url, "lat");

  if (
    lng === null ||
    lat === null ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return NextResponse.json({ error: "定位坐标无效" }, { status: 400 });
  }

  try {
    const location = await createAmapClient().reverseGeocode({
      lngLat: `${lng.toFixed(6)},${lat.toFixed(6)}`,
    });

    return NextResponse.json({ location });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";

    return NextResponse.json(
      { error: `定位名称获取失败：${detail}` },
      { status: 502 }
    );
  }
}
