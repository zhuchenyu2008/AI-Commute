import React from "react";
import { Clock3, MapPin, Timer } from "lucide-react";
import { formatTimeInTimeZone } from "@/lib/time-format";
import {
  SHARE_CARD_CONTENT_MIN_HEIGHT,
  SHARE_CARD_FOOTER_HEIGHT,
  SHARE_CARD_MAX_CONTENT_HEIGHT,
  SHARE_CARD_MAX_HEIGHT,
  getShareCardFontScale,
  type ShareCardLayout,
} from "@/lib/trips/share-image";
import type { PublicTripShareData } from "@/lib/trips/share-types";

type TripShareCardProps = {
  layout: ShareCardLayout;
  qrDataUrl: string;
  trip: PublicTripShareData;
};

function timeLabel(value: string | null, timeZone: string) {
  return formatTimeInTimeZone(value ? new Date(value) : null, timeZone);
}

function scaledFontSize(baseSize: number, scale: number) {
  return `${Math.round(baseSize * scale * 100) / 100}px`;
}

export const TripShareCard = React.forwardRef<HTMLElement, TripShareCardProps>(
  function TripShareCard({ layout, qrDataUrl, trip }, ref) {
  const allSegments = trip.legs.flatMap((leg) => leg.segments);
  const visibleSegments = allSegments.slice(0, layout.visibleSegmentCount);
  const latestDepartAt = trip.legs[0]?.latestDepartAt ?? null;
  const fontScale = getShareCardFontScale({
    titleLength: Array.from(trip.title).length,
    finalStopLength: Array.from(trip.finalStopName ?? "").length,
    segmentCount: allSegments.length,
    segmentTextLength: allSegments.reduce(
      (sum, segment) =>
        sum + Array.from(segment.title).length + Array.from(segment.detail ?? "").length,
      0
    ),
  });

  return (
    <article
      className="flex flex-col overflow-hidden bg-[#f7f9fb] text-[#191c1e]"
      data-share-card="true"
      data-share-font-scale={fontScale.toFixed(2)}
      ref={ref}
      style={{ width: 540, maxHeight: SHARE_CARD_MAX_HEIGHT }}
    >
      <div
        className="flex shrink-0 flex-col overflow-hidden px-8 pb-6 pt-7"
        data-share-content="true"
        style={{
          minHeight: SHARE_CARD_CONTENT_MIN_HEIGHT,
          maxHeight: SHARE_CARD_MAX_CONTENT_HEIGHT,
        }}
      >
        <header className="flex items-start justify-between gap-4">
          <p
            className="text-lg font-bold text-[#2563eb]"
            style={{ fontSize: scaledFontSize(18, fontScale) }}
          >
            AI Commute
          </p>
          <span
            className="shrink-0 rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-bold text-[#166534]"
            style={{ fontSize: scaledFontSize(12, fontScale) }}
          >
            行程分享
          </span>
        </header>

        <h1
          className="mt-4 break-all text-[30px] font-bold leading-[1.18]"
          style={{ fontSize: scaledFontSize(30, fontScale) }}
        >
          {trip.title}
        </h1>
        {trip.finalStopName ? (
          <p
            className="mt-2 flex items-center gap-2 text-sm font-medium text-[#434655]"
            style={{ fontSize: scaledFontSize(14, fontScale) }}
          >
            <MapPin aria-hidden="true" className="size-4 text-[#2563eb]" />
            <span className="break-all">{trip.finalStopName}</span>
          </p>
        ) : null}

        <section className="mt-5 grid grid-cols-3 gap-3 border-y border-[#e0e3e5] py-4">
          <Metric
            icon={<Clock3 aria-hidden="true" className="size-[18px]" />}
            label="最晚出发"
            value={timeLabel(latestDepartAt, trip.timezone)}
            fontScale={fontScale}
          />
          <Metric
            icon={<MapPin aria-hidden="true" className="size-[18px]" />}
            label="目标到达"
            value={timeLabel(trip.targetArriveAt, trip.timezone)}
            fontScale={fontScale}
          />
          <Metric
            icon={<Timer aria-hidden="true" className="size-[18px]" />}
            label="预计用时"
            value={`${trip.totalMinutes} 分钟`}
            fontScale={fontScale}
          />
        </section>

        <section
          className="mt-4 flex min-h-0 flex-1 flex-col"
          aria-label="路线步骤"
        >
          {visibleSegments.length > 0 ? (
            <ol
              className="flex min-h-0 flex-1 flex-col justify-between gap-4"
              data-share-route-list="true"
            >
              {visibleSegments.map((segment, index) => (
                <li
                  className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2"
                  data-share-route-item="true"
                  key={`${segment.title}-${index}`}
                >
                  <span className="mt-1.5 flex size-3 items-center justify-center rounded-full border-2 border-[#2563eb] bg-white">
                    <span className="size-1 rounded-full bg-[#2563eb]" />
                  </span>
                  <div className="min-w-0">
                    <p
                      className="break-all text-sm font-bold"
                      data-share-segment-title="true"
                      style={{ fontSize: scaledFontSize(14, fontScale) }}
                    >
                      {segment.title}
                    </p>
                    {segment.detail ? (
                      <p
                        className="break-all text-xs text-[#737686]"
                        data-share-segment-detail="true"
                        style={{
                          fontSize: scaledFontSize(14, fontScale),
                          lineHeight: 1.45,
                        }}
                      >
                        {segment.detail}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="rounded-full bg-[#e8edff] px-2 py-1 text-xs font-bold text-[#3f465c]"
                    data-share-segment-minutes="true"
                    style={{
                      fontSize: scaledFontSize(14, fontScale),
                      lineHeight: 1.2,
                    }}
                  >
                    {segment.minutes} 分钟
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p
              className="border-l-2 border-[#2563eb] py-1 pl-3 text-sm font-medium text-[#434655]"
              style={{ fontSize: scaledFontSize(14, fontScale) }}
            >
              路线详情待完善
            </p>
          )}
        </section>
      </div>

      <footer
        className="flex h-[108px] shrink-0 items-center justify-between gap-5 border-t border-[#e0e3e5] bg-white px-8"
        data-share-qr-footer="true"
        style={{ height: SHARE_CARD_FOOTER_HEIGHT }}
      >
        <div className="min-w-0">
          <p className="text-lg font-bold text-[#191c1e]">AI Commute</p>
          <p className="mt-1 text-sm font-medium text-[#737686]">
            扫码查看完整行程
          </p>
        </div>
        <div className="shrink-0 bg-white p-2">
          <img
            alt="公开行程二维码"
            className="size-[84px]"
            data-share-qr="true"
            src={qrDataUrl}
          />
        </div>
      </footer>
    </article>
    );
  }
);

function Metric({
  fontScale,
  icon,
  label,
  value,
}: {
  fontScale: number;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p
        className="flex items-center gap-1 text-[11px] font-medium text-[#737686]"
        data-share-metric-label="true"
        style={{
          fontSize: scaledFontSize(14, fontScale),
          lineHeight: 1.35,
        }}
      >
        {icon}
        {label}
      </p>
      <p
        className="mt-1 break-words text-sm font-bold text-[#191c1e]"
        data-share-metric-value="true"
        style={{
          fontSize: scaledFontSize(18, fontScale),
          lineHeight: 1.25,
        }}
      >
        {value}
      </p>
    </div>
  );
}
