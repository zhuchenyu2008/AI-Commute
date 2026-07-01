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

  it("does not throw when saving a prompt if sessionStorage rejects writes", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(() => savePendingAgentPrompt("office")).not.toThrow();
  });

  it("returns empty string when reading a pending prompt fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    let prompt: string | undefined;

    expect(() => {
      prompt = takePendingAgentPrompt();
    }).not.toThrow();
    expect(prompt).toBe("");
  });

  it("returns the read prompt when removing the pending prompt fails", () => {
    sessionStorage.setItem(AGENT_TRANSITION_PROMPT_KEY, "office");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    let prompt: string | undefined;

    expect(() => {
      prompt = takePendingAgentPrompt();
    }).not.toThrow();
    expect(prompt).toBe("office");
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
