"use client";

import React, { useEffect, useId, useState } from "react";
import { Trash2 } from "lucide-react";

type DeleteConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  itemLabel?: string;
  error?: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const EXIT_ANIMATION_MS = 180;

export function DeleteConfirmDialog({
  open,
  title,
  description,
  itemLabel,
  error,
  isPending = false,
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const titleId = useId();
  const [isMounted, setIsMounted] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setIsMounted(true);
      setIsClosing(false);
      return;
    }

    if (!isMounted) {
      return;
    }

    setIsClosing(true);
    const timeout = window.setTimeout(() => {
      setIsMounted(false);
      setIsClosing(false);
    }, EXIT_ANIMATION_MS);

    return () => window.clearTimeout(timeout);
  }, [isMounted, open]);

  useEffect(() => {
    if (!isMounted || isClosing) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClosing, isMounted, isPending, onCancel]);

  if (!isMounted) {
    return null;
  }

  const motionState = isClosing ? "closing" : "open";

  return (
    <div
      className={`delete-confirm-layer fixed inset-0 z-[60] flex items-center justify-center bg-[#191c1e]/32 p-5 sm:p-6 ${
        isClosing ? "delete-confirm-overlay-out" : "delete-confirm-overlay-in"
      }`}
      data-state={motionState}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`w-full max-w-sm rounded-3xl border border-white/80 bg-white/95 p-5 shadow-[0_24px_80px_rgba(45,49,51,0.18)] ${
          isClosing ? "delete-confirm-panel-out" : "delete-confirm-panel-in"
        }`}
        data-state={motionState}
        role="dialog"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#ffdad6] text-[#93000a]">
            <Trash2 aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#191c1e]" id={titleId}>
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#434655]">
              {description}
            </p>
          </div>
        </div>

        {itemLabel ? (
          <p className="mt-4 break-words rounded-2xl bg-[#f2f4f6]/80 p-3 text-sm font-bold text-[#191c1e]">
            {itemLabel}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm font-semibold text-[#ba1a1a]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            autoFocus
            className="rounded-full bg-[#f2f4f6] px-4 py-2 text-sm font-bold text-[#434655] transition hover:bg-[#e6e8ea] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="rounded-full bg-[#ffdad6] px-4 py-2 text-sm font-bold text-[#93000a] transition hover:bg-[#ffc4bd] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? "正在删除" : "确认删除"}
          </button>
        </div>
      </section>
    </div>
  );
}
