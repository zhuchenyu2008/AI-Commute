import { DEFAULT_PLANNING_MODEL } from "@/lib/agent/model-config";

export type AppEnv = {
  databaseUrl: string;
  defaultCity: string;
  defaultTimezone: string;
  openAiModel: string;
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
    openAiModel: env.OPENAI_MODEL?.trim() || DEFAULT_PLANNING_MODEL,
    hasAmapKey: hasValue(env.AMAP_API_KEY),
    hasOpenAiKey: hasValue(env.OPENAI_API_KEY),
    hasTelegramConfig: hasValue(env.TELEGRAM_BOT_TOKEN),
    hasEmailConfig:
      hasValue(env.SMTP_HOST) &&
      hasValue(env.SMTP_USER) &&
      (hasValue(env.SMTP_PASS) || hasValue(env.SMTP_PASSWORD))
  };
}
