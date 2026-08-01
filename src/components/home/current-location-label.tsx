"use client";

import React, { useEffect, useState } from "react";

type CurrentLocationLabelProps = {
  fallbackCity: string;
  className?: string;
  onLocationResolved?: (location: CurrentLocationPayload) => void;
  onLocatingStateChange?: (isLocatingWithoutCache: boolean) => void;
};

export const CURRENT_LOCATION_STORAGE_KEY = "ai-commute:current-location";
export const CURRENT_LOCATION_CACHE_MS = 5 * 60 * 1000;

const CURRENT_LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 30_000,
};

export type CurrentLocationPayload = {
  name?: string;
  lngLat?: string;
  city?: string;
  updatedAt?: number;
};

type ReverseGeocodePayload = {
  location?: CurrentLocationPayload;
};

export function getCurrentLocationTextSizeClass(label: string) {
  const length = Array.from(label.trim()).length;

  if (length <= 4) {
    return "text-3xl md:text-4xl";
  }

  if (length <= 8) {
    return "text-2xl md:text-3xl";
  }

  if (length <= 12) {
    return "text-xl md:text-2xl";
  }

  return "text-lg md:text-xl";
}

function readFreshCurrentLocation(): CurrentLocationPayload | null {
  try {
    const raw = window.localStorage.getItem(CURRENT_LOCATION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const location = JSON.parse(raw) as CurrentLocationPayload;
    if (
      !location.name?.trim() ||
      !location.lngLat?.trim() ||
      typeof location.updatedAt !== "number" ||
      Date.now() - location.updatedAt >= CURRENT_LOCATION_CACHE_MS
    ) {
      window.localStorage.removeItem(CURRENT_LOCATION_STORAGE_KEY);
      return null;
    }

    return location;
  } catch {
    window.localStorage.removeItem(CURRENT_LOCATION_STORAGE_KEY);
    return null;
  }
}

function storeCurrentLocation(location: CurrentLocationPayload) {
  if (!location.name || !location.lngLat) {
    return;
  }

  const updatedAt = Date.now();
  try {
    window.localStorage.setItem(
      CURRENT_LOCATION_STORAGE_KEY,
      JSON.stringify({
        name: location.name,
        lngLat: location.lngLat,
        city: location.city,
        updatedAt,
      })
    );
  } catch {
    // The current result can still be shown when browser storage is unavailable.
  }

  return updatedAt;
}

export function CurrentLocationLabel({
  fallbackCity,
  className,
  onLocationResolved,
  onLocatingStateChange,
}: CurrentLocationLabelProps) {
  const [label, setLabel] = useState(fallbackCity);
  const classes = [
    "max-w-full break-words normal-case leading-tight tracking-normal [overflow-wrap:anywhere] [text-wrap:balance] transition-[font-size] duration-200",
    getCurrentLocationTextSizeClass(label),
    className,
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const cachedLocation = readFreshCurrentLocation();
    setLabel(cachedLocation?.name ?? fallbackCity);
    onLocatingStateChange?.(!cachedLocation);
    if (cachedLocation) {
      onLocationResolved?.(cachedLocation);
    }

    if (!navigator.geolocation) {
      return;
    }

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lng = position.coords.longitude.toFixed(6);
        const lat = position.coords.latitude.toFixed(6);

        try {
          const response = await fetch(
            `/api/location/reverse-geocode?lng=${lng}&lat=${lat}`
          );
          const payload = (await response.json().catch(
            () => ({})
          )) as ReverseGeocodePayload;

          if (cancelled) {
            return;
          }

          const location = payload.location;
          if (response.ok && location?.name && location.lngLat) {
            const updatedAt = storeCurrentLocation(location);
            const resolvedLocation = { ...location, updatedAt };
            setLabel(location.name);
            onLocatingStateChange?.(false);
            onLocationResolved?.(resolvedLocation);
          }
        } catch {
          // Keep the default or the recent cached location visible.
        }
      },
      () => {
        // Keep the default or the recent cached location visible.
      },
      CURRENT_LOCATION_OPTIONS
    );

    return () => {
      cancelled = true;
    };
  }, [fallbackCity, onLocatingStateChange, onLocationResolved]);

  return (
    <span className={classes} title={label}>
      {label}
    </span>
  );
}
