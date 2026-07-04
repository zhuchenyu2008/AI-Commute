export type PoiSearchRequest = {
  keywords: string;
  city?: string;
};

export type PoiDetailRequest = {
  id: string;
};

export type Poi = {
  id: string;
  name: string;
  address: string;
  lngLat: string;
  raw?: unknown;
};

export type WeatherRequest = {
  city: string;
};

export type WeatherReference = {
  kind: "reference";
  city: string;
  summary: string;
  raw?: unknown;
};

export type ReverseGeocodeRequest = {
  lngLat: string;
};

export type ReverseGeocodeResult = {
  name: string;
  address: string;
  city: string;
  lngLat: string;
  raw?: unknown;
};

export type RouteMode = "transit" | "walking" | "bicycling";

export type RouteRequest = {
  origin: string;
  destination: string;
  city?: string;
  cityd?: string;
};

export type RouteResult = {
  mode: RouteMode;
  durationMinutes: number;
  summary: string;
  raw?: unknown;
};

export type AmapClient = {
  searchPoi(request: PoiSearchRequest): Promise<Poi[]>;
  getPoiDetail(request: PoiDetailRequest): Promise<Poi>;
  getWeather(request: WeatherRequest): Promise<WeatherReference>;
  reverseGeocode(request: ReverseGeocodeRequest): Promise<ReverseGeocodeResult>;
  getTransitRoute(request: RouteRequest): Promise<RouteResult>;
  getWalkingRoute(request: RouteRequest): Promise<RouteResult>;
  getBicyclingRoute(request: RouteRequest): Promise<RouteResult>;
};
