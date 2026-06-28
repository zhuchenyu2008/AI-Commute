import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readEnv } from "@/lib/env";

const ROUTE_PREFERENCES = new Set(["balanced", "fastest", "habit", "transit", "bike"]);
const TIMEZONES = new Set(["Asia/Shanghai"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LNG_LAT_PATTERN = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;

function getSettingsDefaults() {
  const env = readEnv();
  return {
    defaultCity: env.defaultCity,
    timezone: env.defaultTimezone,
    originName: env.defaultOriginName,
    originLngLat: env.defaultOrigin,
    routePreference: "balanced",
    telegramChatId: null,
    emailRecipient: null
  };
}

function asOptionalString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidLngLat(value: string) {
  if (!LNG_LAT_PATTERN.test(value)) return false;
  const [lng, lat] = value.split(",").map(Number);
  return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function validateSettings(data: {
  defaultCity: string;
  timezone: string;
  originName: string;
  originLngLat: string;
  routePreference: string;
  telegramChatId: string | null;
  emailRecipient: string | null;
}) {
  const errors: string[] = [];

  if (!data.defaultCity) errors.push("defaultCity is required");
  if (!TIMEZONES.has(data.timezone)) errors.push("timezone is unsupported");
  if (!data.originName) errors.push("originName is required");
  if (!isValidLngLat(data.originLngLat)) errors.push("originLngLat is invalid");
  if (!ROUTE_PREFERENCES.has(data.routePreference)) {
    errors.push("routePreference is unsupported");
  }
  if (data.emailRecipient && !EMAIL_PATTERN.test(data.emailRecipient)) {
    errors.push("emailRecipient is invalid");
  }

  return errors;
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id }
  });

  return NextResponse.json({ settings: settings ?? getSettingsDefaults() });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const defaults = getSettingsDefaults();
  const data = {
    defaultCity:
      asOptionalString(body.defaultCity) || defaults.defaultCity,
    timezone: asOptionalString(body.timezone) || defaults.timezone,
    originName:
      asOptionalString(body.originName) || defaults.originName,
    originLngLat:
      asOptionalString(body.originLngLat) || defaults.originLngLat,
    routePreference:
      asOptionalString(body.routePreference) || defaults.routePreference,
    telegramChatId: asOptionalString(body.telegramChatId) ?? null,
    emailRecipient: asOptionalString(body.emailRecipient) ?? null
  };
  const errors = validateSettings(data);

  if (errors.length > 0) {
    return NextResponse.json({ error: "Invalid settings", details: errors }, { status: 400 });
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: data,
    create: {
      userId: user.id,
      ...data
    }
  });

  return NextResponse.json({ settings });
}
