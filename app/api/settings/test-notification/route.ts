import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { sendEmail } from "@/lib/notifications/email";
import { sendTelegram } from "@/lib/notifications/telegram";
import { APP_NAME } from "@/lib/project";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const channel = asTrimmedString(body.channel);

  if (channel === "telegram") {
    const telegramChatId = asTrimmedString(body.telegramChatId);

    if (!telegramChatId) {
      return NextResponse.json(
        { error: "Telegram Chat ID 不能为空" },
        { status: 400 }
      );
    }

    const result = await sendTelegram({
      chatId: telegramChatId,
      text: `${APP_NAME} 测试消息：如果你收到这条消息，Telegram 通知已可用。`,
    });

    return NextResponse.json({ result });
  }

  if (channel === "email") {
    const emailRecipient = asTrimmedString(body.emailRecipient);

    if (!emailRecipient) {
      return NextResponse.json(
        { error: "邮件接收人不能为空" },
        { status: 400 }
      );
    }

    if (!EMAIL_PATTERN.test(emailRecipient)) {
      return NextResponse.json(
        { error: "邮件接收人格式无效" },
        { status: 400 }
      );
    }

    const result = await sendEmail({
      to: emailRecipient,
      subject: `${APP_NAME} 测试邮件`,
      text: `${APP_NAME} 测试邮件：如果你收到这封邮件，邮件通知已可用。`,
    });

    return NextResponse.json({ result });
  }

  return NextResponse.json({ error: "不支持该测试渠道" }, { status: 400 });
}
