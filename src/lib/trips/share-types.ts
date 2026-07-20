export type PublicTripShareSegment = {
  mode: string;
  title: string;
  detail: string | null;
  minutes: number;
};

export type PublicTripShareLeg = {
  originName: string;
  destinationName: string;
  latestDepartAt: string | null;
  targetArriveAt: string | null;
  routeTitle: string | null;
  routeMode: string | null;
  routeMinutes: number;
  bufferMinutes: number;
  segments: PublicTripShareSegment[];
};

export type PublicTripShareData = {
  title: string;
  timezone: string;
  targetArriveAt: string | null;
  finalStopName: string | null;
  totalRouteMinutes: number;
  totalBufferMinutes: number;
  totalMinutes: number;
  stops: Array<{ name: string }>;
  legs: PublicTripShareLeg[];
};
