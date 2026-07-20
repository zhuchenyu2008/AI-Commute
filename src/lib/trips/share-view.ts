import type { PublicTripShareData } from "@/lib/trips/share-types";

type Candidate = {
  id: string;
  title: string;
  mode: string;
  routeMinutes: number;
  bufferMinutes: number;
  selected?: boolean;
};

export type TripShareSource = {
  title: string;
  timezone: string;
  targetArriveAt: Date | null;
  finalStopName: string | null;
  stops: Array<{ order: number; name: string }>;
  legs: Array<{
    order: number;
    originName: string;
    destinationName: string;
    latestDepartAt: Date | null;
    targetArriveAt: Date | null;
    selectedCandidate: Candidate | null;
    routeCandidates: Candidate[];
    routeSegments: Array<{
      candidateId: string | null;
      order: number;
      mode: string;
      title: string;
      detail: string | null;
      minutes: number;
    }>;
  }>;
};

function toIso(value: Date | null) {
  return value?.toISOString() ?? null;
}

export function toPublicTripShareData(
  source: TripShareSource
): PublicTripShareData {
  const legs = [...source.legs]
    .sort((a, b) => a.order - b.order)
    .map((leg) => {
      const candidate =
        leg.selectedCandidate ??
        leg.routeCandidates.find((item) => item.selected) ??
        null;

      return {
        originName: leg.originName,
        destinationName: leg.destinationName,
        latestDepartAt: toIso(leg.latestDepartAt),
        targetArriveAt: toIso(leg.targetArriveAt),
        routeTitle: candidate?.title ?? null,
        routeMode: candidate?.mode ?? null,
        routeMinutes: candidate?.routeMinutes ?? 0,
        bufferMinutes: candidate?.bufferMinutes ?? 0,
        segments: leg.routeSegments
          .filter((segment) => segment.candidateId === candidate?.id)
          .sort((a, b) => a.order - b.order)
          .map(({ mode, title, detail, minutes }) => ({
            mode,
            title,
            detail,
            minutes,
          })),
      };
    });
  const totalRouteMinutes = legs.reduce(
    (sum, leg) => sum + leg.routeMinutes,
    0
  );
  const totalBufferMinutes = legs.reduce(
    (sum, leg) => sum + leg.bufferMinutes,
    0
  );

  return {
    title: source.title,
    timezone: source.timezone,
    targetArriveAt: toIso(source.targetArriveAt),
    finalStopName: source.finalStopName,
    totalRouteMinutes,
    totalBufferMinutes,
    totalMinutes: totalRouteMinutes + totalBufferMinutes,
    stops: [...source.stops]
      .sort((a, b) => a.order - b.order)
      .map(({ name }) => ({ name })),
    legs,
  };
}
