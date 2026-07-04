"use client";

import React, { useEffect, useState } from "react";

type CurrentLocationLabelProps = {
  fallbackCity: string;
  className?: string;
};

export const CURRENT_LOCATION_STORAGE_KEY = "ai-commute:current-location";

type CurrentLocationPayload = {
  name?: string;
  lngLat?: string;
  city?: string;
};

type ReverseGeocodePayload = {
  location?: CurrentLocationPayload;
};

function storeCurrentLocation(location: CurrentLocationPayload) {
  if (!location.name || !location.lngLat) {
    return;
  }

  window.localStorage.setItem(
    CURRENT_LOCATION_STORAGE_KEY,
    JSON.stringify({
      name: location.name,
      lngLat: location.lngLat,
      city: location.city,
    })
  );
}

export function CurrentLocationLabel({
  fallbackCity,
  className,
}: CurrentLocationLabelProps) {
  const [label, setLabel] = useState(fallbackCity);
  const classes = ["normal-case tracking-normal", className]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    setLabel(fallbackCity);

    if (!navigator.geolocation) {
      window.localStorage.removeItem(CURRENT_LOCATION_STORAGE_KEY);
      return;
    }

    let cancelled = false;
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const lng = position.coords.longitude.toFixed(6);
        const lat = position.coords.latitude.toFixed(6);

        setLabel("定位中");

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
            storeCurrentLocation(location);
            setLabel(location.name);
            return;
          }

          window.localStorage.removeItem(CURRENT_LOCATION_STORAGE_KEY);
          setLabel(fallbackCity);
        } catch {
          if (!cancelled) {
            window.localStorage.removeItem(CURRENT_LOCATION_STORAGE_KEY);
            setLabel(fallbackCity);
          }
        }
      },
      () => {
        window.localStorage.removeItem(CURRENT_LOCATION_STORAGE_KEY);
        setLabel(fallbackCity);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 60_000,
        timeout: 10_000,
      }
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [fallbackCity]);

  return <span className={classes}>{label}</span>;
}
