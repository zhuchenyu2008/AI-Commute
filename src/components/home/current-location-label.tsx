import React from "react";

type CurrentLocationLabelProps = {
  fallbackCity: string;
};

export function CurrentLocationLabel({ fallbackCity }: CurrentLocationLabelProps) {
  return <span className="normal-case tracking-normal">{fallbackCity}</span>;
}
