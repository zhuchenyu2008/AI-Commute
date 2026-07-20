import React from "react";
import { Clock3, MapPin, Timer } from "lucide-react";
import { RouteTimeline } from "@/components/trips/route-timeline";
import { formatTimeInTimeZone } from "@/lib/time-format";
import type { PublicTripShareData } from "@/lib/trips/share-types";

function parseDate(value: string | null) {
  return value ? new Date(value) : null;
}

export function PublicTripShare({ trip }: { trip: PublicTripShareData }) {
  const firstLeg = trip.legs[0];
  const routeGroups = trip.legs.map((leg, legIndex) => ({
    title: `${leg.originName} 到 ${leg.destinationName}`,
    subtitle: [
      leg.latestDepartAt
        ? `${formatTimeInTimeZone(
            parseDate(leg.latestDepartAt),
            trip.timezone
          )} 前出发`
        : null,
      leg.targetArriveAt
        ? `${formatTimeInTimeZone(
            parseDate(leg.targetArriveAt),
            trip.timezone
          )} 前到达`
        : null,
    ]
      .filter(Boolean)
      .join(" / "),
    segments: leg.segments.map((segment, segmentIndex) => ({
      ...segment,
      id: `${legIndex}-${segmentIndex}`,
    })),
  }));
  const hasRouteSegments = routeGroups.some(
    (group) => group.segments.length > 0
  );

  return (
    <main className="min-h-dvh bg-[#f7f9fb] px-5 py-8 text-[#191c1e] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#e0e3e5] pb-6">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#2563eb]">AI Commute</p>
            <h1 className="mt-2 break-words text-3xl font-bold leading-tight sm:text-4xl">
              {trip.title}
            </h1>
            {trip.finalStopName ? (
              <p className="mt-3 flex items-center gap-2 text-sm font-medium text-[#434655]">
                <MapPin aria-hidden="true" className="size-4 text-[#2563eb]" />
                {trip.finalStopName}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-bold text-[#166534]">
            公开只读
          </span>
        </header>

        <section
          aria-label="行程时间摘要"
          className="grid grid-cols-1 gap-4 border-b border-[#e0e3e5] py-6 sm:grid-cols-3 sm:gap-6"
        >
          <SummaryItem
            icon={<Clock3 aria-hidden="true" className="size-5" />}
            label="最晚出发"
            value={formatTimeInTimeZone(
              parseDate(firstLeg?.latestDepartAt ?? null),
              trip.timezone
            )}
          />
          <SummaryItem
            icon={<MapPin aria-hidden="true" className="size-5" />}
            label="目标到达"
            value={formatTimeInTimeZone(
              parseDate(trip.targetArriveAt),
              trip.timezone
            )}
          />
          <SummaryItem
            icon={<Timer aria-hidden="true" className="size-5" />}
            label="预计用时"
            value={`${trip.totalMinutes} 分钟`}
          />
        </section>

        <section className="py-6" aria-labelledby="public-route-heading">
          <h2
            className="text-lg font-bold text-[#191c1e]"
            id="public-route-heading"
          >
            路线详情
          </h2>
          <div className="mt-4">
            {hasRouteSegments ? (
              <RouteTimeline groups={routeGroups} />
            ) : (
              <p className="border-l-2 border-[#2563eb] py-2 pl-4 text-sm font-medium text-[#434655]">
                路线详情待完善
              </p>
            )}
          </div>
        </section>

        <footer className="border-t border-[#e0e3e5] pt-5 text-xs leading-5 text-[#737686]">
          此页面仅供查看，内容可能随行程更新。
        </footer>
      </div>
    </main>
  );
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#e8edff] text-[#2563eb]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#737686]">{label}</p>
        <p className="mt-1 break-words text-base font-bold text-[#191c1e]">
          {value}
        </p>
      </div>
    </div>
  );
}
