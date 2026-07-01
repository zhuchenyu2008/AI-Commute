import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/email";
import { buildTemplateTestEmails } from "@/lib/notifications/test-email-samples";

async function main() {
  const settings = await prisma.userSettings.findFirst({
    where: {
      emailRecipient: { not: null },
    },
    orderBy: { updatedAt: "desc" },
  });

  const recipient = settings?.emailRecipient?.trim();

  if (!recipient) {
    throw new Error("没有找到已配置的邮件接收人 emailRecipient。");
  }

  const emails = buildTemplateTestEmails();

  for (const email of emails) {
    const result = await sendEmail({
      to: recipient,
      subject: `[测试] ${email.subject}`,
      text: email.text,
      html: email.html,
    });

    console.log(
      `[${email.label}] ${result.status} -> ${result.recipient ?? recipient}${
        result.error ? ` (${result.error})` : ""
      }`
    );

    if (result.status !== "sent") {
      throw new Error(`${email.label}测试邮件未发送成功：${result.error ?? result.status}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
