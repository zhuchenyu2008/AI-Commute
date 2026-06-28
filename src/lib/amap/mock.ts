import type {
  AmapClient,
  Poi,
  PoiSearchRequest,
  RouteRequest,
  RouteResult,
  WeatherRequest,
  WeatherReference
} from "./types";

const mockPoi: Poi = {
  id: "mock-longhu-tianjie",
  name: "Longhu Tianjie Ningbo",
  address: "Longhu Tianjie, Ningbo, Zhejiang",
  lngLat: "121.616,29.868",
  raw: {
    source: "mock"
  }
};

const clonePoi = (poi: Poi): Poi => ({
  ...poi,
  raw: poi.raw
});

const createRoute = (
  request: RouteRequest,
  mode: RouteResult["mode"],
  durationMinutes: number
): RouteResult => ({
  mode,
  durationMinutes,
  summary: `${mode} route from ${request.origin} to ${request.destination}`,
  raw: {
    source: "mock",
    request: { ...request }
  }
});

export function createMockAmapClient(): AmapClient {
  return {
    async searchPoi(request: PoiSearchRequest): Promise<Poi[]> {
      return [
        {
          ...clonePoi(mockPoi),
          raw: {
            source: "mock",
            request: { ...request }
          }
        }
      ];
    },

    async getPoiDetail({ id }: { id: string }): Promise<Poi> {
      return {
        ...clonePoi(mockPoi),
        id,
        raw: {
          source: "mock",
          id
        }
      };
    },

    async getWeather({ city }: WeatherRequest): Promise<WeatherReference> {
      return {
        kind: "reference",
        city,
        summary: `${city} reference weather: clear, mild, commute context only.`,
        raw: {
          source: "mock",
          city
        }
      };
    },

    async getTransitRoute(request: RouteRequest): Promise<RouteResult> {
      return createRoute(request, "transit", 42);
    },

    async getWalkingRoute(request: RouteRequest): Promise<RouteResult> {
      return createRoute(request, "walking", 58);
    },

    async getBicyclingRoute(request: RouteRequest): Promise<RouteResult> {
      return createRoute(request, "bicycling", 24);
    }
  };
}
