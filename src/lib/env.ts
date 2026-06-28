export type AppEnv = {
  databaseUrl: string;
  defaultCity: string;
  defaultTimezone: string;
  defaultOrigin: string;
  defaultOriginName: string;
  hasAmapKey: boolean;
  hasOpenAiKey: boolean;
  hasTelegramConfig: boolean;
  hasEmailConfig: boolean;
};

type EnvInput = Partial<Record<string, string | undefined>>;

const hasValue = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

export function readEnv(env: EnvInput = process.env): AppEnv {
  return {
    databaseUrl: env.DATABASE_URL ?? "file:./dev.db",
    defaultCity: env.DEFAULT_CITY ?? "宁波",
    defaultTimezone: env.DEFAULT_TIMEZONE ?? "Asia/Shanghai",
    defaultOrigin: env.DEFAULT_ORIGIN ?? "121.5230315924,29.8652491273",
    defaultOriginName: env.DEFAULT_ORIGIN_NAME ?? "家",
    hasAmapKey: hasValue(env.AMAP_API_KEY),
    hasOpenAiKey: hasValue(env.OPENAI_API_KEY),
    hasTelegramConfig:
      hasValue(env.TELEGRAM_BOT_TOKEN) && hasValue(env.TELEGRAM_CHAT_ID),
    hasEmailConfig:
      hasValue(env.SMTP_HOST) &&
      hasValue(env.SMTP_USER) &&
      (hasValue(env.SMTP_PASS) || hasValue(env.SMTP_PASSWORD))
  };
}
