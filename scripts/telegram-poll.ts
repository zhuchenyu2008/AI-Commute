import { runTelegramPolling } from "@/lib/telegram/polling";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

function parseTimeoutSeconds(value: string | undefined): number {
  if (!value) return 30;

  const timeoutSeconds = Number(value);
  return Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
    ? timeoutSeconds
    : 30;
}

if (!token) {
  console.log("未配置 TELEGRAM_BOT_TOKEN，Telegram 轮询 worker 不会启动。");
  process.exit(0);
}

runTelegramPolling({
  token,
  timeoutSeconds: parseTimeoutSeconds(
    process.env.TELEGRAM_POLL_TIMEOUT_SECONDS
  ),
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Telegram 轮询 worker 失败：${message}`);
  process.exit(1);
});
