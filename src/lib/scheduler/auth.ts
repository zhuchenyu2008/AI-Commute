import { randomBytes } from "node:crypto";

type EnvSource = Partial<Record<string, string | undefined>>;

const hasValue = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

let generatedProductionSecret: string | null = null;

function getSchedulerSecret(env: EnvSource) {
  const configuredSecret = env.SCHEDULER_TICK_SECRET?.trim();

  if (hasValue(configuredSecret)) {
    return configuredSecret;
  }

  if (env.NODE_ENV === "production") {
    generatedProductionSecret ??= randomBytes(32).toString("base64url");
    return generatedProductionSecret;
  }

  return null;
}

export function isSchedulerAuthorized(
  request: Request,
  env: EnvSource = process.env
) {
  const secret = getSchedulerSecret(env);

  if (!hasValue(secret)) {
    return true;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const headerSecret = request.headers.get("x-scheduler-secret")?.trim();

  return bearer === secret || headerSecret === secret;
}
