"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  getRouteTransitionDirection,
  startRouteViewTransition,
} from "@/lib/ui/agent-transition";

type RouteTransitionLinkProps = Omit<
  React.ComponentProps<typeof Link>,
  "href"
> & {
  href: string;
};

function shouldUseNativeLink(
  event: React.MouseEvent<HTMLAnchorElement>,
  target?: string
) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    (target && target !== "_self")
  );
}

export function RouteTransitionLink({
  href,
  onClick,
  target,
  ...props
}: RouteTransitionLinkProps) {
  const pathname = usePathname();
  const router = useRouter();

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (shouldUseNativeLink(event, target)) {
      return;
    }

    const currentPath =
      pathname ||
      (typeof window === "undefined" ? "/" : window.location.pathname);
    const targetUrl =
      typeof window === "undefined"
        ? new URL(href, "https://commute-planner.local")
        : new URL(href, window.location.href);

    if (
      typeof window !== "undefined" &&
      targetUrl.origin !== window.location.origin
    ) {
      return;
    }

    const nextHref = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
    const currentHref =
      typeof window === "undefined"
        ? currentPath
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextHref === currentHref) {
      return;
    }

    event.preventDefault();

    startRouteViewTransition(() => router.push(nextHref), {
      completion: "next-page",
      direction: getRouteTransitionDirection(currentPath, targetUrl.pathname),
      targetRoute: targetUrl.pathname,
    });
  }

  return (
    <Link href={href} onClick={handleClick} target={target} {...props} />
  );
}
