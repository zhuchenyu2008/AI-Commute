"use client";

import React, { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import {
  savePendingAgentPrompt,
  startRouteViewTransition,
} from "@/lib/ui/agent-transition";
import { CURRENT_LOCATION_STORAGE_KEY } from "./current-location-label";

type CurrentLocationContext = {
  name: string;
  lngLat: string;
  city?: string;
};

type PlanningPurpose = "planning" | "travel";

export function getAgentStartResult(
  status: number,
  payload: { actionHref?: unknown; error?: unknown; sessionId?: unknown }
) {
  if (status === 401) {
    return { error: "", route: "/login" };
  }

  if (status >= 200 && status < 300 && typeof payload.sessionId === "string") {
    return { error: "", route: `/agent/${payload.sessionId}` };
  }

  if (typeof payload.actionHref === "string") {
    return {
      error: typeof payload.error === "string" ? payload.error : "请先完成设置",
      route: payload.actionHref,
    };
  }

  return {
    error: typeof payload.error === "string" ? payload.error : "无法开始规划。",
    route: null,
  };
}

function readStoredCurrentLocation(): CurrentLocationContext | null {
  const raw = window.localStorage.getItem(CURRENT_LOCATION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CurrentLocationContext>;

    if (typeof parsed.name === "string" && typeof parsed.lngLat === "string") {
      return {
        name: parsed.name,
        lngLat: parsed.lngLat,
        city: typeof parsed.city === "string" ? parsed.city : undefined,
      };
    }
  } catch {
    window.localStorage.removeItem(CURRENT_LOCATION_STORAGE_KEY);
  }

  return null;
}

export function CommuteInput() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [purpose, setPurpose] = useState<PlanningPurpose>("planning");
  const isTravel = purpose === "travel";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      setError(isTravel ? "请输入旅行目的地或行程需求。" : "请输入目的地或通勤需求。");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const currentLocation = readStoredCurrentLocation();
      const response = await fetch("/api/agent-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          ...(isTravel ? { purpose: "travel" } : {}),
          ...(currentLocation ? { currentLocation } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      const result = getAgentStartResult(response.status, payload);

      if (!result.route) {
        setError(result.error);
        return;
      }

      if (result.route.startsWith("/agent/")) {
        const sessionId = result.route
          .slice("/agent/".length)
          .split(/[/?#]/)[0];

        savePendingAgentPrompt(trimmedPrompt, sessionId);
        startRouteViewTransition(() => router.push(result.route));
        return;
      }

      router.push(result.route);
    } catch {
      setError("无法开始规划。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="w-full space-y-3" onSubmit={onSubmit}>
      <div
        aria-label="规划类型"
        className="mx-auto flex w-fit items-center gap-1 rounded-full bg-white/65 p-1 shadow-sm"
        role="tablist"
      >
        <button
          aria-selected={!isTravel}
          className={`rounded-full px-4 py-2 text-sm font-bold transition ${
            !isTravel
              ? "bg-[#191c1e] text-white"
              : "text-[#434655] hover:bg-white"
          }`}
          onClick={() => {
            setPurpose("planning");
            setError("");
          }}
          role="tab"
          type="button"
        >
          通勤
        </button>
        <button
          aria-selected={isTravel}
          className={`rounded-full px-4 py-2 text-sm font-bold transition ${
            isTravel
              ? "bg-[#191c1e] text-white"
              : "text-[#434655] hover:bg-white"
          }`}
          onClick={() => {
            setPurpose("travel");
            setError("");
          }}
          role="tab"
          type="button"
        >
          旅行
        </button>
      </div>
      <div
        className="agent-prompt-source group relative"
        data-agent-transition-source="true"
      >
        <Search
          aria-hidden="true"
          className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#737686] transition group-focus-within:text-[#2563eb]"
        />
        <input
          aria-label="搜索目的地"
          className="h-16 w-full rounded-full border-0 bg-[#f2f4f6] px-12 pr-20 text-lg text-[#191c1e] shadow-sm outline-none ring-[#2563eb]/20 transition placeholder:text-[#737686] focus:bg-white focus:ring-4"
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={isTravel ? "去哪玩几天？如：周末自驾去承德" : "你要去哪，几点到？"}
          value={prompt}
        />
        <button
          className="absolute right-2 top-1/2 flex h-12 min-w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[#2563eb] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#004ac6] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? (
            <Loader2 aria-label="正在规划" className="size-5 animate-spin" />
          ) : (
            isTravel ? "规划旅行" : "规划"
          )}
        </button>
      </div>
      <p className="min-h-5 text-center text-xs font-medium uppercase tracking-[0.05em] text-[#434655]">
        {error ||
          (isTravel
            ? "输入目的地、天数、出行方式或预算偏好"
            : "输入目的地、到达时间或完整通勤目标")}
      </p>
    </form>
  );
}
