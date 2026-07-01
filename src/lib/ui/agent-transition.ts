export const AGENT_TRANSITION_PROMPT_KEY = "commute-planner:agent-prompt";

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

export function savePendingAgentPrompt(prompt: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const trimmedPrompt = prompt.trim();

  if (trimmedPrompt.length === 0) {
    return;
  }

  window.sessionStorage.setItem(AGENT_TRANSITION_PROMPT_KEY, trimmedPrompt);
}

export function takePendingAgentPrompt(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const prompt =
    window.sessionStorage.getItem(AGENT_TRANSITION_PROMPT_KEY) ?? "";

  window.sessionStorage.removeItem(AGENT_TRANSITION_PROMPT_KEY);

  return prompt;
}

export function startRouteViewTransition(navigate: () => void): void {
  if (typeof document === "undefined") {
    navigate();
    return;
  }

  const transitionDocument = document as ViewTransitionDocument;

  if (typeof transitionDocument.startViewTransition !== "function") {
    navigate();
    return;
  }

  transitionDocument.startViewTransition(navigate);
}
