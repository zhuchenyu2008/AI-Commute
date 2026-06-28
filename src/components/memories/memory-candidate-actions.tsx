"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MemoryCandidateActions({
  candidateId,
}: {
  candidateId: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("");

  async function submit(action: "confirm" | "ignore") {
    setStatus(action === "confirm" ? "正在确认" : "正在忽略");
    const response = await fetch(`/api/memory-candidates/${candidateId}/${action}`, {
      method: "POST",
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setStatus(payload.error ?? "操作失败");
      return;
    }

    setStatus(action === "confirm" ? "已确认" : "已忽略");
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        className="rounded-full bg-[#2563eb] px-4 py-2 text-sm font-bold text-white"
        onClick={() => submit("confirm")}
        type="button"
      >
        确认
      </button>
      <button
        className="rounded-full bg-[#f2f4f6] px-4 py-2 text-sm font-bold text-[#434655]"
        onClick={() => submit("ignore")}
        type="button"
      >
        忽略
      </button>
      {status ? (
        <span className="text-xs font-semibold text-[#434655]">{status}</span>
      ) : null}
    </div>
  );
}
