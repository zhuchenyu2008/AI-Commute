import type {
  AmapClient,
  Poi,
  PoiDetailRequest,
  PoiSearchRequest,
  RouteMode,
  RouteRequest,
  RouteResult,
  WeatherRequest,
  WeatherReference
} from "./types";
import type { AmapThrottle } from "./throttle";

type AmapClientOptions = {
  apiKey: string;
  throttle: AmapThrottle;
  fetchImpl?: typeof fetch;
};

type AmapEnvelope = {
  status?: string;
  info?: string;
  infocode?: string;
  [key: string]: unknown;
};

type AmapBicyclingEnvelope = {
  errcode?: number | string;
  errmsg?: string;
  errdetail?: string;
  data?: {
    paths?: Array<{ duration?: string | number }>;
  };
  [key: string]: unknown;
};

type AmapPoi = {
  id?: string;
  name?: string;
  address?: string | unknown[];
  location?: string;
  [key: string]: unknown;
};

const BASE_URL = "https://restapi.amap.com/v3";
const BICYCLING_URL = "https://restapi.amap.com/v4/direction/bicycling";

const toPositiveMinutes = (seconds: unknown): number => {
  const durationSeconds = Number(seconds);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(durationSeconds / 60));
};

const formatAddress = (address: AmapPoi["address"]): string => {
  if (Array.isArray(address)) {
    return address.filter((value) => typeof value === "string").join(" ");
  }

  return typeof address === "string" ? address : "";
};

const toPoi = (poi: AmapPoi): Poi => ({
  id: poi.id ?? poi.name ?? "amap-poi",
  name: poi.name ?? "AMap POI",
  address: formatAddress(poi.address),
  lngLat: poi.location ?? "0,0",
  raw: poi
});

export function createRealAmapClient(options: AmapClientOptions): AmapClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  const request = async <T extends AmapEnvelope>(
    url: string,
    params: Record<string, string | undefined>
  ): Promise<T> => {
    const searchParams = new URLSearchParams();
    searchParams.set("key", options.apiKey);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value.trim().length > 0) {
        searchParams.set(key, value);
      }
    }

    return options.throttle.schedule(async () => {
      const response = await fetchImpl(`${url}?${searchParams.toString()}`);

      if (!response.ok) {
        throw new Error(`AMap HTTP failure: ${response.status}`);
      }

      const data = (await response.json()) as T;

      if (data.status !== "1") {
        throw new Error(
          `AMap status failure: ${data.info ?? "unknown"} (${data.infocode ?? "no-code"})`
        );
      }

      return data;
    });
  };

  const requestBicycling = async (
    params: Record<string, string | undefined>
  ): Promise<AmapBicyclingEnvelope> => {
    const searchParams = new URLSearchParams();
    searchParams.set("key", options.apiKey);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value.trim().length > 0) {
        searchParams.set(key, value);
      }
    }

    return options.throttle.schedule(async () => {
      const response = await fetchImpl(`${BICYCLING_URL}?${searchParams.toString()}`);

      if (!response.ok) {
        throw new Error(`AMap HTTP failure: ${response.status}`);
      }

      const data = (await response.json()) as AmapBicyclingEnvelope;
      const errcode = String(data.errcode ?? "");

      if (errcode !== "0") {
        throw new Error(
          `AMap bicycling failure: ${data.errmsg ?? data.errdetail ?? "unknown"} (${errcode || "no-code"})`
        );
      }

      return data;
    });
  };

  const route = async (
    mode: RouteMode,
    url: string,
    requestBody: RouteRequest,
    extraParams: Record<string, string | undefined> = {}
  ): Promise<RouteResult> => {
    const data = await request<AmapEnvelope>(url, {
      origin: requestBody.origin,
      destination: requestBody.destination,
      city: requestBody.city,
      ...extraParams
    });

    return {
      mode,
      durationMinutes: extractRouteDurationMinutes(data),
      summary: `${mode} route from AMap`,
      raw: data
    };
  };

  return {
    async searchPoi(requestBody: PoiSearchRequest): Promise<Poi[]> {
      const data = await request<AmapEnvelope & { pois?: AmapPoi[] }>(
        `${BASE_URL}/place/text`,
        {
          keywords: requestBody.keywords,
          city: requestBody.city,
          output: "json"
        }
      );

      return (data.pois ?? []).map(toPoi);
    },

    async getPoiDetail({ id }: PoiDetailRequest): Promise<Poi> {
      const data = await request<AmapEnvelope & { pois?: AmapPoi[] }>(
        `${BASE_URL}/place/detail`,
        {
          id,
          output: "json"
        }
      );

      const poi = data.pois?.[0];

      if (!poi) {
        throw new Error(`AMap POI detail not found: ${id}`);
      }

      return toPoi(poi);
    },

    async getWeather({ city }: WeatherRequest): Promise<WeatherReference> {
      const data = await request<
        AmapEnvelope & {
          lives?: Array<{
            city?: string;
            weather?: string;
            temperature?: string;
            winddirection?: string;
            windpower?: string;
          }>;
        }
      >(`${BASE_URL}/weather/weatherInfo`, {
        city,
        extensions: "base",
        output: "json"
      });

      const live = data.lives?.[0];
      const weatherCity = live?.city ?? city;
      const summaryParts = [
        live?.weather,
        live?.temperature ? `${live.temperature}C` : undefined,
        live?.winddirection ? `${live.winddirection} wind` : undefined,
        live?.windpower ? `level ${live.windpower}` : undefined
      ].filter(Boolean);

      return {
        kind: "reference",
        city: weatherCity,
        summary: summaryParts.join(", ") || `${weatherCity} weather unavailable`,
        raw: data
      };
    },

    async getTransitRoute(requestBody: RouteRequest): Promise<RouteResult> {
      return route("transit", `${BASE_URL}/direction/transit/integrated`, requestBody, {
        city: requestBody.city,
        cityd: requestBody.cityd,
        output: "json"
      });
    },

    async getWalkingRoute(requestBody: RouteRequest): Promise<RouteResult> {
      return route("walking", `${BASE_URL}/direction/walking`, requestBody, {
        output: "json"
      });
    },

    async getBicyclingRoute(requestBody: RouteRequest): Promise<RouteResult> {
      const data = await requestBicycling({
        origin: requestBody.origin,
        destination: requestBody.destination
      });

      return {
        mode: "bicycling",
        durationMinutes: toPositiveMinutes(data.data?.paths?.[0]?.duration),
        summary: "bicycling route from AMap",
        raw: data
      };
    }
  };
}

function extractRouteDurationMinutes(data: AmapEnvelope): number {
  const route = data.route as
    | {
        paths?: Array<{ duration?: string | number }>;
        transits?: Array<{ duration?: string | number }>;
      }
    | undefined;

  return toPositiveMinutes(
    route?.paths?.[0]?.duration ?? route?.transits?.[0]?.duration
  );
}
