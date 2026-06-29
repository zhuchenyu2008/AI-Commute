import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot } from "lucide-react";
import { AgentEventList } from "@/components/agent/agent-event-list";
import { AppShell } from "@/components/app-shell";
import { GlassCard } from "@/components/glass-card";
import { getCurrentUser } from "@/lib/auth/session";

type AgentPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
  searchParams?: Promise<{
    view?: string;
  }>;
};

export default async function AgentPage({ params, searchParams }: AgentPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { sessionId } = await params;
  const view = (await searchParams)?.view;
  const allowMessages = view === "conversation";

  return (
    <AppShell active="home">
      <div className="mx-auto max-w-3xl space-y-5">
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <Link
              aria-label="返回"
              className="flex size-11 items-center justify-center rounded-full bg-[#f2f4f6] text-[#434655] transition hover:bg-white"
              href="/"
            >
              <ArrowLeft aria-hidden="true" className="size-5" />
            </Link>
            <div className="flex size-11 items-center justify-center rounded-full bg-[#2563eb] text-white">
              <Bot aria-hidden="true" className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#434655]">实时规划</p>
              <p className="text-lg font-bold text-[#191c1e]">
                智能体对话
              </p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <AgentEventList
            allowMessages={allowMessages}
            autoRedirect={true}
            sessionId={sessionId}
          />
        </GlassCard>
      </div>
    </AppShell>
  );
}
