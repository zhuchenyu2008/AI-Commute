"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";

type MonitoringActionsProps = {
  tripId: string;
  status?: string | null;
  disabled?: boolean;
};

export function MonitoringActions({
  tripId,
  status,
  disabled = false,
}: MonitoringActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCancelling, setIsCancelling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCancelled = status === "cancelled";
  const isDisabled =
    disabled || isCancelled || Boolean(message) || isCancelling || isPending;

  async function handleCancel() {
    setMessage(null);
    setError(null);
    setIsCancelling(true);

    try {
      const response = await fetch(`/api/trips/${tripId}/cancel-monitoring`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(body.error ?? "取消监控失败");
        return;
      }

      setMessage("已取消监控");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("取消监控失败");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#191c1e] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#30343a] disabled:cursor-not-allowed disabled:bg-[#c3c6d7] disabled:text-[#434655]"
        disabled={isDisabled}
        onClick={handleCancel}
        type="button"
      >
        <XCircle aria-hidden="true" className="size-4" />
        {isCancelled || message
          ? "监控已取消"
          : isCancelling || isPending
            ? "正在取消"
            : "取消监控"}
      </button>
      {message ? (
        <p className="text-sm font-medium text-[#166534]">{message}</p>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-[#b42318]">{error}</p>
      ) : null}
    </div>
  );
}
