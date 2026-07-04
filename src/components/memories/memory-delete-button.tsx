"use client";

import { useRouter } from "next/navigation";
import React, { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";

type MemoryDeleteButtonProps = {
  endpoint: string;
  label: string;
};

export function MemoryDeleteButton({
  endpoint,
  label,
}: MemoryDeleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  async function deleteItem() {
    setError("");
    setIsDeleting(true);

    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? "删除失败");
        return;
      }

      setIsConfirmOpen(false);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError("删除失败");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <button
        aria-label={`删除${label}`}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/65 text-[#737686] shadow-sm backdrop-blur transition hover:bg-[#ffdad6] hover:text-[#93000a] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isDeleting || isPending}
        onClick={() => {
          setError("");
          setIsConfirmOpen(true);
        }}
        title="删除"
        type="button"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        <span className="sr-only">
          {isDeleting || isPending ? "正在删除" : "删除"}
        </span>
      </button>
      <DeleteConfirmDialog
        description="这条记忆会从个人上下文中移除。"
        error={error}
        isPending={isDeleting || isPending}
        itemLabel={label}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={deleteItem}
        open={isConfirmOpen}
        title="删除记忆"
      />
    </div>
  );
}
