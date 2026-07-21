"use client";

import React, {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  Download,
  LoaderCircle,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { toPng } from "html-to-image";
import { TripShareCard } from "@/components/trips/trip-share-card";
import {
  buildShareImageFileName,
  getShareCardCaptureHeight,
  getShareCardLayout,
  SHARE_CARD_LOGICAL_WIDTH,
  SHARE_CARD_PIXEL_RATIO,
} from "@/lib/trips/share-image";
import type { PublicTripShareData } from "@/lib/trips/share-types";

type TripShareButtonProps = {
  tripId: string;
  trip: PublicTripShareData;
};

type ShareStateResponse = {
  enabled?: boolean;
  url?: string | null;
  error?: string;
};

function downloadDataUrl(fileName: string, dataUrl: string) {
  const anchor = document.createElement("a");
  anchor.download = fileName;
  anchor.href = dataUrl;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function dataUrlToFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: "image/png" });
}

async function waitForRender() {
  await new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    window.setTimeout(resolve, 0);
  });
}

function supportsSystemFileShare() {
  if (
    typeof navigator === "undefined" ||
    typeof File === "undefined" ||
    typeof navigator.share !== "function" ||
    typeof navigator.canShare !== "function"
  ) {
    return false;
  }

  try {
    return navigator.canShare({
      files: [new File([], "trip-share.png", { type: "image/png" })],
    });
  } catch {
    return false;
  }
}

export function TripShareButton({ tripId, trip }: TripShareButtonProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const busyRef = useRef(false);
  const requestVersionRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    "load" | "copy" | "download" | "share" | "revoke" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const layout = useMemo(
    () =>
      getShareCardLayout(
        trip.legs.reduce((sum, leg) => sum + leg.segments.length, 0)
      ),
    [trip]
  );
  const endpoint = `/api/trips/${tripId}/share`;
  const canUseSystemShare = supportsSystemFileShare();

  function beginAction(action: Exclude<typeof busyAction, "load" | null>) {
    if (busyRef.current) return false;

    busyRef.current = true;
    requestVersionRef.current += 1;
    setBusyAction(action);
    return true;
  }

  function finishAction() {
    busyRef.current = false;
    setBusyAction(null);
  }

  useEffect(() => {
    if (!open) return;

    let active = true;
    const requestVersion = ++requestVersionRef.current;
    busyRef.current = true;
    setBusyAction("load");
    setError(null);

    void requestShareState(endpoint)
      .then((state) => {
        if (!active || requestVersionRef.current !== requestVersion) return;
        setShareUrl(state.enabled ? state.url ?? null : null);
      })
      .catch((requestError) => {
        if (!active || requestVersionRef.current !== requestVersion) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "读取分享状态失败"
        );
      })
      .finally(() => {
        if (active && requestVersionRef.current === requestVersion) {
          finishAction();
        }
      });

    return () => {
      active = false;
      if (requestVersionRef.current === requestVersion) {
        requestVersionRef.current += 1;
        busyRef.current = false;
      }
    };
  }, [endpoint, open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyAction) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busyAction, open]);

  async function ensureShareUrl() {
    if (shareUrl) return shareUrl;

    const state = await requestShareState(endpoint, { method: "POST" });
    if (!state.url) throw new Error("创建公开链接失败");
    setShareUrl(state.url);
    return state.url;
  }

  async function handleCopy() {
    if (!beginAction("copy")) return;
    setMessage(null);
    setError(null);
    setManualUrl(false);

    try {
      const url = await ensureShareUrl();
      if (!navigator.clipboard?.writeText) {
        setManualUrl(true);
        throw new Error("当前浏览器不支持自动复制，请手动复制链接");
      }
      await navigator.clipboard.writeText(url);
      setMessage("链接已复制");
    } catch (copyError) {
      setManualUrl(true);
      setError(
        copyError instanceof Error ? copyError.message : "复制公开链接失败"
      );
    } finally {
      finishAction();
    }
  }

  async function createSharePng(action: "download" | "share") {
    if (!beginAction(action)) return;
    setMessage(null);
    setError(null);

    try {
      const url = await ensureShareUrl();
      const qr = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: 4,
        width: 192,
        color: { dark: "#191c1e", light: "#ffffff" },
      });
      setQrDataUrl(qr);
      await document.fonts?.ready;
      await waitForRender();

      if (!cardRef.current) throw new Error("分享图尚未准备完成");

      const captureHeight = getShareCardCaptureHeight(
        cardRef.current.getBoundingClientRect().height || layout.logicalHeight
      );
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: SHARE_CARD_PIXEL_RATIO,
        width: SHARE_CARD_LOGICAL_WIDTH,
        height: captureHeight,
      });
      const fileName = buildShareImageFileName(trip.title);

      if (action === "share" && canUseSystemShare) {
        try {
          const file = await dataUrlToFile(dataUrl, fileName);
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: trip.title });
            setMessage("分享图已发送到系统分享面板");
            return;
          }
        } catch {
          // Fall through to a local PNG download when native sharing fails.
        }
      }

      downloadDataUrl(fileName, dataUrl);
      setMessage(
        action === "share" ? "系统分享不可用，分享图已下载" : "分享图已生成"
      );
    } catch (imageError) {
      setError(
        imageError instanceof Error ? imageError.message : "生成分享图失败"
      );
    } finally {
      finishAction();
    }
  }

  async function handleRevoke() {
    if (!beginAction("revoke")) return;
    setMessage(null);
    setError(null);

    try {
      await requestShareState(endpoint, { method: "DELETE" });
      setShareUrl(null);
      setQrDataUrl(null);
      setConfirmingRevoke(false);
      setMessage("分享已关闭");
    } catch (revokeError) {
      setError(
        revokeError instanceof Error ? revokeError.message : "关闭分享失败"
      );
    } finally {
      finishAction();
    }
  }

  const dialog = open ? (
    <div className="fixed inset-0 z-[70] grid place-items-end overflow-y-auto bg-[#191c1e]/20 p-4 backdrop-blur-[3px] sm:place-items-center sm:p-6">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-white bg-white p-5 shadow-[0_24px_80px_rgba(45,49,51,0.18)]"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[#e8edff] text-[#2563eb]">
              <Share2 aria-hidden="true" className="size-5" />
            </div>
            <h2 className="text-lg font-bold text-[#191c1e]" id={titleId}>
              分享行程
            </h2>
          </div>
          <button
            aria-label="关闭分享面板"
            className="flex size-10 items-center justify-center rounded-lg text-[#434655] transition hover:bg-[#f2f4f6] disabled:opacity-50"
            disabled={Boolean(busyAction)}
            onClick={() => setOpen(false)}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-2">
          <ActionButton
            busy={busyAction === "copy"}
            disabled={Boolean(busyAction)}
            icon={<Copy aria-hidden="true" className="size-4" />}
            label="复制公开链接"
            onClick={handleCopy}
          />
          <ActionButton
            busy={busyAction === "download"}
            disabled={Boolean(busyAction)}
            icon={<Download aria-hidden="true" className="size-4" />}
            label="生成分享图"
            onClick={() => createSharePng("download")}
          />
          {canUseSystemShare ? (
            <ActionButton
              busy={busyAction === "share"}
              disabled={Boolean(busyAction)}
              icon={<Share2 aria-hidden="true" className="size-4" />}
              label="分享图片"
              onClick={() => createSharePng("share")}
            />
          ) : null}
        </div>

        {manualUrl && shareUrl ? (
          <input
            aria-label="公开链接"
            className="mt-4 w-full rounded-lg border border-[#c3c6d7] bg-[#f7f9fb] px-3 py-2 text-sm text-[#191c1e]"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={shareUrl}
          />
        ) : null}

        {shareUrl ? (
          <div className="mt-5 border-t border-[#e0e3e5] pt-4">
            {confirmingRevoke ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[#434655]">
                  原链接和二维码将立即失效。
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="rounded-lg bg-[#f2f4f6] px-3 py-2 text-sm font-bold text-[#434655]"
                    disabled={Boolean(busyAction)}
                    onClick={() => setConfirmingRevoke(false)}
                    type="button"
                  >
                    取消
                  </button>
                  <button
                    className="rounded-lg bg-[#ffdad6] px-3 py-2 text-sm font-bold text-[#93000a] disabled:opacity-60"
                    disabled={Boolean(busyAction)}
                    onClick={handleRevoke}
                    type="button"
                  >
                    {busyAction === "revoke" ? "正在关闭" : "确认关闭"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-[#93000a] transition hover:bg-[#ffdad6]"
                disabled={Boolean(busyAction)}
                onClick={() => setConfirmingRevoke(true)}
                type="button"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                关闭分享
              </button>
            )}
          </div>
        ) : null}

        {busyAction === "load" ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-[#434655]">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            正在读取分享状态
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-[#166534]">
            <Check aria-hidden="true" className="size-4" />
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm font-semibold text-[#ba1a1a]" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        aria-label="分享行程"
        className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-[#c3c6d7] bg-white/80 text-[#2563eb] shadow-sm transition hover:bg-white"
        onClick={() => {
          busyRef.current = true;
          setBusyAction("load");
          setMessage(null);
          setError(null);
          setManualUrl(false);
          setConfirmingRevoke(false);
          setOpen(true);
        }}
        title="分享行程"
        type="button"
      >
        <Share2 aria-hidden="true" className="size-5" />
      </button>
      {typeof document === "undefined"
        ? dialog
        : dialog
          ? createPortal(dialog, document.body)
          : null}
      {qrDataUrl ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-[-10000px] top-0"
        >
          <TripShareCard
            layout={layout}
            qrDataUrl={qrDataUrl}
            ref={cardRef}
            trip={trip}
          />
        </div>
      ) : null}
    </>
  );
}

async function requestShareState(endpoint: string, init?: RequestInit) {
  const response = await fetch(endpoint, init);
  const body = (await response.json().catch(() => ({}))) as ShareStateResponse;

  if (!response.ok) {
    throw new Error(body.error ?? "行程分享操作失败");
  }

  return body;
}

function ActionButton({
  busy,
  disabled,
  icon,
  label,
  onClick,
}: {
  busy: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-11 items-center gap-3 rounded-lg bg-[#f2f4f6] px-4 py-3 text-left text-sm font-bold text-[#191c1e] transition hover:bg-[#e8edff] disabled:cursor-wait disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {busy ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}
