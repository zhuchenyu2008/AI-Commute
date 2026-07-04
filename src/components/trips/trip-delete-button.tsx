"use client";

import { useRouter } from "next/navigation";
import React, { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

export function TripDeleteButton({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  async function deleteTrip() {
    setError("");
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? "删除行程失败");
        return;
      }

      setIsConfirmOpen(false);
      startTransition(() => {
        router.push("/history");
        router.refresh();
      });
    } catch {
      setError("删除行程失败");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#ffdad6] px-4 py-2 text-sm font-bold text-[#93000a] shadow-sm transition hover:bg-[#ffc4bd] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isDeleting || isPending}
        onClick={() => {
          setError("");
          setIsConfirmOpen(true);
        }}
        type="button"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        {isDeleting || isPending ? "正在删除" : "删除行程"}
      </button>
      <DeleteConfirmDialog
        description="此操作不可恢复。"
        error={error}
        isPending={isDeleting || isPending}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={deleteTrip}
        open={isConfirmOpen}
        title="删除行程"
      />
    </div>
  );
}
