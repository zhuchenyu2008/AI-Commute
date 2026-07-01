import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type TemplateTestEmailKind = "departure-reminder" | "route-change";

let disconnectPrisma: (() => Promise<void>) | null = null;

function parseTemplateEmailKind(
  value: string | undefined
): TemplateTestEmailKind | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "departure-reminder" || value === "route-change") {
    return value;
  }

  throw new Error(
    `未知测试邮件类型：${value}。可用类型：departure-reminder、route-change。`
  );
}

async function main() {
  const { prisma } = await import("@/lib/db");
  const { sendEmail } = await import("@/lib/notifications/email");
  const {
    buildTemplateEmailRecipientQuery,
    selectTemplateEmailRecipient,
  } = await import("@/lib/notifications/test-email-recipient");
  const { sendTemplateTestEmails } = await import(
    "@/lib/notifications/test-email-sender"
  );
  const { buildTemplateTestEmails } = await import(
    "@/lib/notifications/test-email-samples"
  );

  disconnectPrisma = () => prisma.$disconnect();

  const settings = await prisma.userSettings.findMany(
    buildTemplateEmailRecipientQuery()
  );

  const recipient = selectTemplateEmailRecipient(settings);

  if (!recipient) {
    throw new Error("没有找到已配置的邮件接收人 emailRecipient。");
  }

  const emails = buildTemplateTestEmails({
    kind: parseTemplateEmailKind(process.argv[2]),
  });

  await sendTemplateTestEmails({
    recipient,
    emails,
    sendEmail,
    log: console.log,
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma?.();
  });
