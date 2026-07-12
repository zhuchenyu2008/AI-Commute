import { describe, expect, it } from "vitest";
import { isSchedulerAuthorized } from "@/lib/scheduler/auth";

describe("scheduler tick authorization", () => {
  it("allows local ticks when no shared secret is configured", () => {
    const request = new Request("http://localhost/api/scheduler/tick", {
      method: "POST",
    });

    expect(isSchedulerAuthorized(request, {})).toBe(true);
  });

  it("requires auth in production even when no shared secret is configured", () => {
    const request = new Request("http://localhost/api/scheduler/tick", {
      method: "POST",
    });

    expect(isSchedulerAuthorized(request, { NODE_ENV: "production" })).toBe(
      false
    );
  });

  it("requires a matching token when a shared secret is configured", () => {
    const authorized = new Request("http://localhost/api/scheduler/tick", {
      method: "POST",
      headers: { authorization: "Bearer secret-123" },
    });
    const authorizedByHeader = new Request(
      "http://localhost/api/scheduler/tick",
      {
        method: "POST",
        headers: { "x-scheduler-secret": "secret-123" },
      }
    );
    const unauthorized = new Request("http://localhost/api/scheduler/tick", {
      method: "POST",
    });

    expect(
      isSchedulerAuthorized(authorized, { SCHEDULER_TICK_SECRET: "secret-123" })
    ).toBe(true);
    expect(
      isSchedulerAuthorized(authorizedByHeader, {
        SCHEDULER_TICK_SECRET: "secret-123",
      })
    ).toBe(true);
    expect(
      isSchedulerAuthorized(unauthorized, {
        SCHEDULER_TICK_SECRET: "secret-123",
      })
    ).toBe(false);
  });
});
