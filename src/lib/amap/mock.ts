import type {
  AmapClient,
  Poi,
  PoiSearchRequest,
  ReverseGeocodeRequest,
  ReverseGeocodeResult,
  RouteRequest,
  RouteResult,
  WeatherRequest,
  WeatherReference
} from "./types";

const mockPoi: Poi = {
  id: "mock-longhu-tianjie",
  name: "宁波龙湖天街",
  address: "浙江省宁波市龙湖天街",
  lngLat: "121.616,29.868",
  raw: {
    source: "mock"
  }
};

const clonePoi = (poi: Poi): Poi => ({
  ...poi,
  raw: poi.raw
});

const formatRouteMode = (mode: RouteResult["mode"]) => {
  const labels: Record<RouteResult["mode"], string> = {
    bicycling: "骑行",
    driving: "驾车",
    transit: "公交/地铁",
    walking: "步行",
  };

  return labels[mode] ?? "通勤";
};

const createRoute = (
  request: RouteRequest,
  mode: RouteResult["mode"],
  durationMinutes: number
): RouteResult => ({
  mode,
  durationMinutes,
  summary: `${formatRouteMode(mode)}路线：${request.origin} 到 ${request.destination}`,
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
        summary: `${city} 天气参考：晴，温和，仅作通勤参考。`,
        observedAt: new Date().toISOString(),
        forecast: Array.from({ length: 4 }, (_, index) => {
          const date = new Date(Date.now() + index * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);

          return {
            date,
            week: String(index + 1),
            dayWeather: "晴",
            nightWeather: "晴",
            dayTemperature: 28,
            nightTemperature: 20,
            dayWind: "东南",
            nightWind: "东南",
            dayPower: "3",
            nightPower: "3",
            summary: "晴，20~28°C，东南风3级",
          };
        }),
        raw: {
          source: "mock",
          city
        }
      };
    },

    async reverseGeocode({
      lngLat,
    }: ReverseGeocodeRequest): Promise<ReverseGeocodeResult> {
      return {
        name: "宁波外事学校",
        address: "浙江省宁波市鄞州区",
        city: "宁波",
        lngLat,
        raw: {
          source: "mock",
          lngLat,
        },
      };
    },

    async getTransitRoute(request: RouteRequest): Promise<RouteResult> {
      return createRoute(request, "transit", 42);
    },

    async getDrivingRoute(request: RouteRequest): Promise<RouteResult> {
      return createRoute(request, "driving", 36);
    },

    async getWalkingRoute(request: RouteRequest): Promise<RouteResult> {
      return createRoute(request, "walking", 58);
    },

    async getBicyclingRoute(request: RouteRequest): Promise<RouteResult> {
      return createRoute(request, "bicycling", 24);
    }
  };
}
