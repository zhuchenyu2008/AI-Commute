"use client";

import React from "react";
import { useEffect, useState } from "react";
import { CloudSun } from "lucide-react";
import { GlassCard } from "@/components/glass-card";

export const WEATHER_REFRESH_MS = 30 * 60 * 1000;

type WeatherPayload = {
  weather?: {
    city?: string;
    summary?: string;
  };
  error?: string;
};

export function WeatherCard({
  city,
  refreshMs = WEATHER_REFRESH_MS,
}: {
  city: string;
  refreshMs?: number;
}) {
  const [summary, setSummary] = useState("正在更新");

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      try {
        const response = await fetch(
          `/api/weather?city=${encodeURIComponent(city)}`
        );
        const payload = (await response.json().catch(() => ({}))) as WeatherPayload;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setSummary(payload.error ?? "天气暂不可用");
          return;
        }

        setSummary(payload.weather?.summary || "天气暂不可用");
      } catch {
        if (!cancelled) {
          setSummary("天气暂不可用");
        }
      }
    }

    void loadWeather();
    const interval = window.setInterval(loadWeather, refreshMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [city, refreshMs]);

  return (
    <GlassCard className="flex shrink-0 items-center gap-2 rounded-xl p-3">
      <CloudSun aria-hidden="true" className="size-6 text-[#F59E0B]" />
      <div>
        <p className="text-sm font-bold text-[#191c1e]">{city}</p>
        <p className="text-xs font-medium text-[#434655]">{summary}</p>
      </div>
    </GlassCard>
  );
}
