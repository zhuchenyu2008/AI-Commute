export const AGENT_TRANSITION_PROMPT_KEY = "commute-planner:agent-prompt";
export const AGENT_TRANSITION_SESSION_KEY = "commute-planner:agent-session";
export const ROUTE_TRANSITION_DIRECTION_KEY =
  "commute-planner:route-transition-direction";

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => unknown;
};

export type RouteTransitionDirection = "back" | "forward" | "neutral";

type RouteTransitionCompletion = "manual" | "next-page";

type StartRouteViewTransitionOptions = {
  completion?: RouteTransitionCompletion;
  direction?: RouteTransitionDirection;
  targetRoute?: string;
};

const ROUTE_VIEW_TRANSITION_TIMEOUT_MS = 1200;
const NAV_ROUTE_ORDER = ["/", "/history", "/memories", "/settings"] as const;

let pendingRouteTransition: {
  completion: RouteTransitionCompletion;
  resolve: () => void;
  targetRoute: string | null;
  timeoutId: number | undefined;
} | null = null;

function resolvePendingRouteTransition() {
  if (!pendingRouteTransition) {
    return;
  }

  const { resolve, timeoutId } = pendingRouteTransition;
  pendingRouteTransition = null;

  if (timeoutId !== undefined && typeof window !== "undefined") {
    window.clearTimeout(timeoutId);
  }

  resolve();
}

function normalizeRoutePath(route: string): string {
  try {
    const url = new URL(route, "https://commute-planner.local");
    const pathname = url.pathname.replace(/\/+$/, "");

    return pathname || "/";
  } catch {
    const pathname = route.split(/[?#]/)[0]?.replace(/\/+$/, "");

    return pathname || "/";
  }
}

function setRouteTransitionDirection(direction: RouteTransitionDirection) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.routeTransitionDirection = direction;
  }

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(ROUTE_TRANSITION_DIRECTION_KEY, direction);
  } catch {
    // Best-effort only; the current document still carries the CSS direction.
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const matchMedia = window.matchMedia;

    if (typeof matchMedia !== "function") {
      return false;
    }

    return matchMedia.call(window, "(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function getRouteTransitionDirection(
  currentRoute: string,
  nextRoute: string
): RouteTransitionDirection {
  const currentPath = normalizeRoutePath(currentRoute);
  const nextPath = normalizeRoutePath(nextRoute);

  if (currentPath === nextPath) {
    return "neutral";
  }

  const currentIndex = NAV_ROUTE_ORDER.indexOf(
    currentPath as (typeof NAV_ROUTE_ORDER)[number]
  );
  const nextIndex = NAV_ROUTE_ORDER.indexOf(
    nextPath as (typeof NAV_ROUTE_ORDER)[number]
  );

  if (currentIndex >= 0 && nextIndex >= 0) {
    return nextIndex > currentIndex ? "forward" : "back";
  }

  return "forward";
}

export function savePendingAgentPrompt(prompt: string, sessionId?: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const trimmedPrompt = prompt.trim();
  const trimmedSessionId = sessionId?.trim() ?? "";

  if (trimmedPrompt.length === 0) {
    return;
  }

  try {
    window.sessionStorage.setItem(AGENT_TRANSITION_PROMPT_KEY, trimmedPrompt);
  } catch {
    return;
  }

  try {
    if (trimmedSessionId) {
      window.sessionStorage.setItem(
        AGENT_TRANSITION_SESSION_KEY,
        trimmedSessionId
      );
    } else {
      window.sessionStorage.removeItem(AGENT_TRANSITION_SESSION_KEY);
    }
  } catch {
    return;
  }
}

export function takePendingAgentPrompt(sessionId?: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  let prompt = "";
  let storedSessionId = "";

  try {
    prompt = window.sessionStorage.getItem(AGENT_TRANSITION_PROMPT_KEY) ?? "";
  } catch {
    return "";
  }

  try {
    storedSessionId =
      window.sessionStorage.getItem(AGENT_TRANSITION_SESSION_KEY) ?? "";
  } catch {
    storedSessionId = "";
  }

  try {
    window.sessionStorage.removeItem(AGENT_TRANSITION_PROMPT_KEY);
  } catch {
    // Best-effort cleanup only; the prompt should still be usable.
  }

  try {
    window.sessionStorage.removeItem(AGENT_TRANSITION_SESSION_KEY);
  } catch {
    // Best-effort cleanup only; the prompt should still be usable.
  }

  if (sessionId && storedSessionId && storedSessionId !== sessionId) {
    return "";
  }

  return prompt;
}

export function completeRouteViewTransition(): void {
  resolvePendingRouteTransition();
}

export function completePageRouteViewTransition(currentRoute?: string): void {
  if (pendingRouteTransition?.completion !== "next-page") {
    return;
  }

  const targetRoute = pendingRouteTransition.targetRoute;

  if (
    !targetRoute ||
    !currentRoute ||
    normalizeRoutePath(currentRoute) === targetRoute
  ) {
    resolvePendingRouteTransition();
  }
}

export function startRouteViewTransition(
  navigate: () => void,
  options: StartRouteViewTransitionOptions = {}
): void {
  resolvePendingRouteTransition();

  setRouteTransitionDirection(options.direction ?? "forward");

  if (prefersReducedMotion()) {
    navigate();
    return;
  }

  if (typeof document === "undefined") {
    navigate();
    return;
  }

  const transitionDocument = document as ViewTransitionDocument;

  if (typeof transitionDocument.startViewTransition !== "function") {
    navigate();
    return;
  }

  transitionDocument.startViewTransition(() => {
    navigate();

    return new Promise<void>((resolve) => {
      const timeoutId =
        typeof window === "undefined"
          ? undefined
          : window.setTimeout(
              resolvePendingRouteTransition,
              ROUTE_VIEW_TRANSITION_TIMEOUT_MS
            );

      pendingRouteTransition = {
        completion: options.completion ?? "manual",
        resolve,
        targetRoute: options.targetRoute
          ? normalizeRoutePath(options.targetRoute)
          : null,
        timeoutId,
      };
    });
  });
}
