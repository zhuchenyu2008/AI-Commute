"use client";

import React from "react";
import { useCallback, useState } from "react";
import { MapPin } from "lucide-react";
import {
  CurrentLocationLabel,
  type CurrentLocationPayload,
} from "@/components/home/current-location-label";
import { WeatherCard } from "@/components/home/weather-card";

export function LocationWeatherHeader({
  defaultCity,
  fallbackLocationName,
}: {
  defaultCity: string;
  fallbackLocationName: string;
}) {
  const [locatedCity, setLocatedCity] = useState<string | null>(null);
  const [isLocatingWithoutCache, setIsLocatingWithoutCache] = useState(true);
  const handleLocationResolved = useCallback(
    (location: CurrentLocationPayload) => {
      const city = location.city?.trim();
      if (city) {
        setLocatedCity((current) => (current === city ? current : city));
      }
    },
    []
  );

  return (
    <header className="flex min-w-0 items-start justify-between gap-3 sm:gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.05em] text-[#434655]">
          <MapPin aria-hidden="true" className="size-4 text-[#2563eb]" />
          {isLocatingWithoutCache ? "正在定位中" : "当前位置"}
        </p>
        <h1 className="min-w-0 font-bold text-[#191c1e]">
          <CurrentLocationLabel
            className="block"
            fallbackCity={fallbackLocationName}
            onLocationResolved={handleLocationResolved}
            onLocatingStateChange={setIsLocatingWithoutCache}
          />
        </h1>
      </div>
      <div className="max-w-[58%] shrink-0 sm:max-w-[52%]">
        <WeatherCard defaultCity={defaultCity} locatedCity={locatedCity} />
      </div>
    </header>
  );
}
