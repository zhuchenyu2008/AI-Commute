import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readEnv } from "@/lib/env";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
  });
  const env = readEnv();

  const values = {
    defaultCity: settings?.defaultCity ?? env.defaultCity,
    timezone: settings?.timezone ?? env.defaultTimezone,
    originName: settings?.originName ?? "",
    originLngLat: settings?.originLngLat ?? "",
    routePreference: settings?.routePreference ?? "balanced",
    telegramChatId: settings?.telegramChatId ?? "",
    emailRecipient: settings?.emailRecipient ?? "",
    routeChangeThresholdMinutes: settings?.routeChangeThresholdMinutes ?? 3,
  };

  return (
    <AppShell active="settings">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-on-surface-variant">
            通勤规划助手
          </p>
          <h1 className="text-3xl font-semibold text-on-surface">设置</h1>
        </div>

        <SettingsForm values={values} />
      </section>
    </AppShell>
  );
}
