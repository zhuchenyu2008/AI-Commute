// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_TRANSITION_PROMPT_KEY,
  savePendingAgentPrompt,
  startRouteViewTransition,
  takePendingAgentPrompt,
} from "@/lib/ui/agent-transition";

type TestViewTransitionDocument = {
  startViewTransition?: (callback: () => void) => unknown;
};

describe("agent transition helpers", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    delete (document as unknown as TestViewTransitionDocument)
      .startViewTransition;
  });

  it("saves and consumes trimmed prompt from sessionStorage", () => {
    savePendingAgentPrompt("  take me to the office  ");

    expect(sessionStorage.getItem(AGENT_TRANSITION_PROMPT_KEY)).toBe(
      "take me to the office"
    );
    expect(takePendingAgentPrompt()).toBe("take me to the office");
    expect(sessionStorage.getItem(AGENT_TRANSITION_PROMPT_KEY)).toBeNull();
  });

  it("does not store empty or blank prompts", () => {
    savePendingAgentPrompt("");
    savePendingAgentPrompt("  \n\t  ");

    expect(sessionStorage.getItem(AGENT_TRANSITION_PROMPT_KEY)).toBeNull();
  });

  it("calls navigate directly when View Transitions are unavailable", () => {
    const navigate = vi.fn();

    startRouteViewTransition(navigate);

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("uses document.startViewTransition when available and invokes navigate exactly once", () => {
    const navigate = vi.fn();
    const startViewTransition = vi.fn((callback: () => void) => {
      callback();
      return {};
    });
    (document as unknown as TestViewTransitionDocument).startViewTransition =
      startViewTransition;

    startRouteViewTransition(navigate);

    expect(startViewTransition).toHaveBeenCalledWith(navigate);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
