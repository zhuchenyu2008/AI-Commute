"use client";

import { useEffect, useState } from "react";

type CurrentLocationLabelProps = {
  fallbackCity: string;
};

function formatCoordinate(value: number) {
  return value.toFixed(4);
}

export function CurrentLocationLabel({ fallbackCity }: CurrentLocationLabelProps) {
  const [label, setLabel] = useState(fallbackCity);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLabel(fallbackCity);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLabel(
          `${formatCoordinate(position.coords.latitude)}, ${formatCoordinate(
            position.coords.longitude
          )}`
        );
      },
      () => {
        setLabel(fallbackCity);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 5000,
      }
    );
  }, [fallbackCity]);

  return <span className="normal-case tracking-normal">{label}</span>;
}
