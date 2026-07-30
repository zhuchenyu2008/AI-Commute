"use client";

import React, { useEffect, useState } from "react";

type CurrentLocationLabelProps = {
  fallbackCity: string;
  className?: string;
};

export const CURRENT_LOCATION_STORAGE_KEY = "ai-commute:current-location";
export const CURRENT_LOCATION_REFRESH_MS = 60_000;
export const CURRENT_LOCATION_FAILURE_DISPLAY_MS = 3_000;

const CURRENT_LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 30_000,
};

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
  const [label, setLabel] = useState("GPS定位中");
  const classes = ["normal-case tracking-normal", className]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    setLabel("GPS定位中");
    window.localStorage.removeItem(CURRENT_LOCATION_STORAGE_KEY);

    if (!navigator.geolocation) {
      setLabel("GPS定位不可用");
      const fallbackTimer = window.setTimeout(
        () => setLabel(fallbackCity),
        CURRENT_LOCATION_FAILURE_DISPLAY_MS
      );
      return () => window.clearTimeout(fallbackTimer);
    }

    let cancelled = false;
    let latestRequestId = 0;
    let fallbackTimer: number | undefined;

    const failLocation = (message: string, requestId: number) => {
      if (!cancelled && requestId === latestRequestId) {
        window.localStorage.removeItem(CURRENT_LOCATION_STORAGE_KEY);
        setLabel(message);
        window.clearTimeout(fallbackTimer);
        fallbackTimer = window.setTimeout(() => {
          if (!cancelled && requestId === latestRequestId) {
            setLabel(fallbackCity);
          }
        }, CURRENT_LOCATION_FAILURE_DISPLAY_MS);
      }
    };

    const requestCurrentLocation = () => {
      const requestId = ++latestRequestId;
      window.clearTimeout(fallbackTimer);
      setLabel("GPS定位中");

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

            if (cancelled || requestId !== latestRequestId) {
              return;
            }

            const location = payload.location;
            if (response.ok && location?.name && location.lngLat) {
              storeCurrentLocation(location);
              setLabel(location.name);
              return;
            }

            failLocation("定位名称获取失败", requestId);
          } catch {
            failLocation("定位名称获取失败", requestId);
          }
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            failLocation("GPS定位权限未开启", requestId);
            return;
          }

          if (error.code === error.TIMEOUT) {
            failLocation("GPS定位超时", requestId);
            return;
          }

          failLocation("GPS定位失败", requestId);
        },
        CURRENT_LOCATION_OPTIONS
      );
    };

    requestCurrentLocation();
    const refreshTimer = window.setInterval(
      requestCurrentLocation,
      CURRENT_LOCATION_REFRESH_MS
    );

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [fallbackCity]);

  return <span className={classes}>{label}</span>;
}
