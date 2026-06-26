"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { apiFetch } from "@/lib/client/api";

type AgentSession = {
  id: string;
  title: string;
  status: string;
  tripId?: string | null;
};

type AgentMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

type AgentToolCall = {
  id: string;
  toolName: string;
  status: string;
  reason?: string;
  result?: Record<string, unknown>;
};

type AgentSessionResponse = {
  sessionId: string;
  session: AgentSession;
  messages: AgentMessage[];
  toolCalls: AgentToolCall[];
  tripId?: string | null;
};

export default function AgentSessionPage() {
  return (
    <Suspense fallback={null}>
      <AgentSessionContent />
    </Suspense>
  );
}

function AgentSessionContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const [data, setData] = useState<AgentSessionResponse | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (params.id === "new") {
      apiFetch<AgentSessionResponse>("/api/agent/sessions", {
        method: "POST",
        body: JSON.stringify({
          text: "继续管理这趟行程，先读取行程状态并等待我的下一步指令。",
          tripId: search.get("tripId")
        })
      })
        .then((result) => {
          window.history.replaceState(null, "", `/agent/sessions/${result.sessionId}`);
          setData(result);
        })
        .catch((err) => setError(err.message));
      return;
    }
    apiFetch<AgentSessionResponse>(`/api/agent/sessions/${params.id}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [params.id, search]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<AgentSessionResponse>(`/api/agent/sessions/${params.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: input })
      });
      setData((current) =>
        current
          ? {
              ...result,
              messages: [...current.messages, ...result.messages],
              toolCalls: result.toolCalls
            }
          : result
      );
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent 处理失败");
    } finally {
      setBusy(false);
    }
  }

  const latestToolCalls = useMemo(() => (data?.toolCalls || []).slice(-6).reverse(), [data?.toolCalls]);
  const tripId = data?.tripId || data?.session.tripId || null;

  if (!data) {
    return (
      <AppShell showBottomNav={false}>
        <div className="px-5 pt-14 text-sm font-semibold text-[var(--on-surface-variant)]">{error || "Agent 会话加载中..."}</div>
      </AppShell>
    );
  }

  return (
    <AppShell showBottomNav={false}>
      <header className="sticky top-0 z-20 border-b border-white/40 bg-[var(--background)]/90 px-4 pb-3 pt-10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex h-11 w-11 items-center justify-center rounded-full">
            <Icon name="arrow_back" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase text-[var(--on-surface-variant)]">Agent 正在管理</p>
            <h1 className="truncate text-xl font-extrabold tracking-normal">{data.session.title}</h1>
          </div>
          {tripId ? (
            <Link href={`/trips/${tripId}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary-container)] text-white">
              <Icon name="route" />
            </Link>
          ) : null}
        </div>
      </header>

      <main className="space-y-5 px-5 py-5">
        {tripId ? (
          <GlassCard as={Link} href={`/trips/${tripId}`} className="flex items-center justify-between rounded-xl p-4">
            <div>
              <StatusPill>已创建行程</StatusPill>
              <p className="mt-2 text-sm font-semibold text-[var(--on-surface-variant)]">查看路线、提醒和复算状态</p>
            </div>
            <Icon name="chevron_right" />
          </GlassCard>
        ) : null}

        <section className="space-y-3">
          {data.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {busy ? (
            <div className="rounded-2xl bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--on-surface-variant)]">
              Agent 正在决定要查什么、怎么查、是否更新提醒...
            </div>
          ) : null}
        </section>

        {latestToolCalls.length > 0 ? (
          <section>
            <h2 className="mb-3 text-sm font-extrabold uppercase text-[var(--on-surface-variant)]">执行记录</h2>
            <div className="space-y-2">
              {latestToolCalls.map((call) => (
                <div key={call.id} className="flex items-start gap-3 rounded-xl bg-white/70 p-3">
                  <Icon name={call.status === "failed" ? "error" : "task_alt"} className="mt-0.5 text-[20px] text-[var(--primary)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold">{toolLabel(call.toolName)}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--on-surface-variant)]">{call.reason || call.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {error ? <p className="text-center text-sm font-semibold text-[var(--error)]">{error}</p> : null}
      </main>

      <form onSubmit={submit} className="sticky bottom-0 z-20 border-t border-white/40 bg-[var(--background)]/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <input
            value={input}
            disabled={busy}
            onChange={(event) => setInput(event.target.value)}
            placeholder="继续告诉 Agent：改提醒、换路线、记住偏好..."
            className="min-w-0 flex-1 rounded-full border-0 bg-white/85 px-4 py-3 text-base font-semibold outline-none"
          />
          <button
            disabled={busy || !input.trim()}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-container)] text-white disabled:opacity-50"
            aria-label="发送"
          >
            <Icon name="send" />
          </button>
        </div>
      </form>
    </AppShell>
  );
}

function MessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[82%] rounded-2xl bg-[var(--primary-container)] px-4 py-3 text-white"
            : isSystem
              ? "max-w-full rounded-xl bg-[var(--tertiary-fixed)] px-4 py-3 text-sm text-[var(--on-tertiary-fixed)]"
              : "max-w-[86%] rounded-2xl bg-white/80 px-4 py-3 text-[var(--on-surface)]"
        }
      >
        <p className="whitespace-pre-wrap text-sm font-semibold leading-6">{message.content}</p>
      </div>
    </div>
  );
}

function toolLabel(name: string) {
  const labels: Record<string, string> = {
    get_profile: "读取个人资料",
    list_memories: "读取记忆库",
    search_poi: "查询地点",
    get_weather: "查询天气",
    estimate_route: "估算路线",
    create_commute_plan: "创建通勤计划",
    save_memory: "写入记忆",
    cancel_trip: "取消行程",
    recheck_route_watch: "复算提醒"
  };
  return labels[name] || name;
}
