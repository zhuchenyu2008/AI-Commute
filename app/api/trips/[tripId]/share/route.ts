import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  enableTripShare,
  getTripShareState,
  revokeTripShare,
  TripShareNotFoundError,
} from "@/lib/trips/share-service";

type RouteContext = {
  params: Promise<{ tripId: string }>;
};

function buildPublicUrl(request: Request, token: string) {
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim();

  if (configuredBaseUrl) {
    try {
      const parsedBaseUrl = new URL(configuredBaseUrl);

      if (
        parsedBaseUrl.protocol === "http:" ||
        parsedBaseUrl.protocol === "https:"
      ) {
        return new URL(`/share/${token}`, parsedBaseUrl).toString();
      }
    } catch {
      // Fall back to the public proxy headers or the request URL.
    }
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const requestHost = forwardedHost || request.headers.get("host")?.trim();

  if (requestHost) {
    const forwardedProtocol = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    const requestProtocol = new URL(request.url).protocol.replace(":", "");
    const protocol =
      forwardedProtocol === "http" || forwardedProtocol === "https"
        ? forwardedProtocol
        : requestProtocol;

    try {
      return new URL(`/share/${token}`, `${protocol}://${requestHost}`).toString();
    } catch {
      // Fall back to the request URL when proxy headers are malformed.
    }
  }

  return new URL(`/share/${token}`, request.url).toString();
}

function stateResponse(
  request: Request,
  share: { token: string; revokedAt: Date | null } | null
) {
  const enabled = Boolean(share && !share.revokedAt);

  return NextResponse.json({
    enabled,
    url: enabled && share ? buildPublicUrl(request, share.token) : null,
  });
}

function errorResponse(error: unknown) {
  if (error instanceof TripShareNotFoundError) {
    return NextResponse.json({ error: "行程不存在" }, { status: 404 });
  }

  return NextResponse.json({ error: "行程分享操作失败" }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { tripId } = await context.params;

  try {
    return stateResponse(
      request,
      await getTripShareState(tripId, user.id)
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { tripId } = await context.params;

  try {
    return stateResponse(request, await enableTripShare(tripId, user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { tripId } = await context.params;

  try {
    await revokeTripShare(tripId, user.id);
    return stateResponse(request, null);
  } catch (error) {
    return errorResponse(error);
  }
}
