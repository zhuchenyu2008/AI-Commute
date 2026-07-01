import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

let disconnectPrisma: (() => Promise<void>) | null = null;

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

  const emails = buildTemplateTestEmails();

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
