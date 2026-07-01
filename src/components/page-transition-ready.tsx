"use client";

import { useEffect } from "react";
import { completePageRouteViewTransition } from "@/lib/ui/agent-transition";

export function PageTransitionReady({ route }: { route: string }) {
  useEffect(() => {
    completePageRouteViewTransition(route);
  }, [route]);

  return null;
}
