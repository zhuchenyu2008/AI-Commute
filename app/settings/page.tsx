import React from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readEnv } from "@/lib/env";
import { APP_NAME, AUTHOR_NAME, REPOSITORY_URL } from "@/lib/project";
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
            {APP_NAME}
          </p>
          <h1 className="text-3xl font-semibold text-on-surface">设置</h1>
        </div>

        <SettingsForm values={values} />

        <div className="glass-card flex flex-col gap-3 rounded-2xl p-5 text-sm text-on-surface-variant shadow-lg shadow-slate-200/60 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-on-surface">项目署名</p>
            <p className="mt-1">Created by {AUTHOR_NAME}</p>
          </div>
          <a
            className="inline-flex items-center justify-center rounded-2xl bg-[#dae2fd] px-4 py-2 font-semibold text-[#1d3d7c] transition hover:bg-[#bec6e0]"
            href={REPOSITORY_URL}
            rel="noreferrer"
            target="_blank"
          >
            GitHub 仓库
          </a>
        </div>
      </section>
    </AppShell>
  );
}
