"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";
import { CloudSun } from "lucide-react";
import { GlassCard } from "@/components/glass-card";

export const WEATHER_REFRESH_MS = 60 * 60 * 1000;
export const WEATHER_STORAGE_KEY_PREFIX = "ai-commute:weather:v1";

type WeatherPayload = {
  weather?: {
    city?: string;
    summary?: string;
  };
  error?: string;
};

type CachedWeather = {
  city: string;
  summary: string;
  updatedAt: number;
};

export function getWeatherStorageKey(city: string) {
  return `${WEATHER_STORAGE_KEY_PREFIX}:${city.trim().toLocaleLowerCase()}`;
}

function readCachedWeather(city: string): CachedWeather | null {
  try {
    const raw = window.localStorage.getItem(getWeatherStorageKey(city));
    if (!raw) {
      return null;
    }

    const cached = JSON.parse(raw) as Partial<CachedWeather>;
    if (
      cached.city !== city ||
      typeof cached.summary !== "string" ||
      !cached.summary.trim() ||
      typeof cached.updatedAt !== "number"
    ) {
      return null;
    }

    return cached as CachedWeather;
  } catch {
    return null;
  }
}

function storeCachedWeather(city: string, summary: string) {
  try {
    window.localStorage.setItem(
      getWeatherStorageKey(city),
      JSON.stringify({ city, summary, updatedAt: Date.now() } satisfies CachedWeather)
    );
  } catch {
    // Storage can be unavailable in privacy mode; the live weather still works.
  }
}

export function WeatherCard({
  defaultCity,
  locatedCity,
  refreshMs = WEATHER_REFRESH_MS,
}: {
  defaultCity: string;
  locatedCity?: string | null;
  refreshMs?: number;
}) {
  const [weather, setWeather] = useState({
    city: defaultCity,
    summary: "正在更新",
  });
  const showingLocatedWeatherRef = useRef(false);
  const locatedRequestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let requestInFlight = false;
    let hasDefaultWeather = false;

    showingLocatedWeatherRef.current = false;

    const cached = readCachedWeather(defaultCity);
    if (cached) {
      hasDefaultWeather = true;
      setWeather({ city: defaultCity, summary: cached.summary });
    } else {
      setWeather({ city: defaultCity, summary: "正在更新" });
    }

    async function refreshDefaultWeather() {
      if (requestInFlight) {
        return;
      }

      requestInFlight = true;

      try {
        const response = await fetch(
          `/api/weather?city=${encodeURIComponent(defaultCity)}`
        );
        const payload = (await response.json().catch(() => ({}))) as WeatherPayload;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          if (!hasDefaultWeather && !showingLocatedWeatherRef.current) {
            setWeather({
              city: defaultCity,
              summary: payload.error ?? "天气暂不可用",
            });
          }
          return;
        }

        const nextSummary = payload.weather?.summary?.trim();
        if (nextSummary) {
          hasDefaultWeather = true;
          storeCachedWeather(defaultCity, nextSummary);
          if (!showingLocatedWeatherRef.current) {
            setWeather({ city: defaultCity, summary: nextSummary });
          }
        } else if (
          !hasDefaultWeather &&
          !showingLocatedWeatherRef.current
        ) {
          setWeather({ city: defaultCity, summary: "天气暂不可用" });
        }
      } catch {
        if (
          !cancelled &&
          !hasDefaultWeather &&
          !showingLocatedWeatherRef.current
        ) {
          setWeather({ city: defaultCity, summary: "天气暂不可用" });
        }
      } finally {
        requestInFlight = false;
      }
    }

    void refreshDefaultWeather();
    const interval = window.setInterval(refreshDefaultWeather, refreshMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [defaultCity, refreshMs]);

  useEffect(() => {
    const nextLocatedCity = locatedCity?.trim();
    if (!nextLocatedCity) {
      return;
    }

    if (nextLocatedCity === defaultCity) {
      showingLocatedWeatherRef.current = false;
      const cached = readCachedWeather(defaultCity);
      if (cached) {
        setWeather({ city: defaultCity, summary: cached.summary });
      }
      return;
    }

    const requestedLocatedCity = nextLocatedCity;
    let cancelled = false;
    const requestId = ++locatedRequestIdRef.current;

    async function loadLocatedWeather() {
      try {
        const response = await fetch(
          `/api/weather?city=${encodeURIComponent(requestedLocatedCity)}`
        );
        const payload = (await response.json().catch(() => ({}))) as WeatherPayload;

        if (cancelled || requestId !== locatedRequestIdRef.current) {
          return;
        }

        const nextSummary = payload.weather?.summary?.trim();
        if (response.ok && nextSummary) {
          showingLocatedWeatherRef.current = true;
          setWeather({
            city: payload.weather?.city?.trim() || requestedLocatedCity,
            summary: nextSummary,
          });
        }
      } catch {
        // Keep showing the default-city weather when location weather fails.
      }
    }

    void loadLocatedWeather();

    return () => {
      cancelled = true;
    };
  }, [defaultCity, locatedCity]);

  return (
    <GlassCard className="flex min-w-0 shrink-0 items-center gap-2 rounded-xl p-3">
      <CloudSun aria-hidden="true" className="size-6 text-[#F59E0B]" />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[#191c1e]">
          {weather.city}
        </p>
        <p className="line-clamp-2 text-xs font-medium text-[#434655]">
          {weather.summary}
        </p>
      </div>
    </GlassCard>
  );
}
