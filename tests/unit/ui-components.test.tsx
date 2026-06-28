import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout from "@app/layout";
import {
  buildAgentEvents,
  formatAgentToolName,
  getAgentConversationHref,
  getAgentSessionViewState,
} from "@/components/agent/agent-event-list";
import { BottomNav } from "@/components/bottom-nav";
import { getAgentStartResult } from "@/components/home/commute-input";
import { BufferList } from "@/components/trips/buffer-list";
import { RouteTimeline } from "@/components/trips/route-timeline";
import { SettingsForm } from "@app/settings/settings-form";

describe("sample-aligned UI components", () => {
  it("renders BottomNav labels and navigation aria labels", () => {
    const html = renderToStaticMarkup(<BottomNav active="home" />);

    expect(html).toContain("aria-label=\"首页\"");
    expect(html).toContain("aria-label=\"历史\"");
    expect(html).toContain("aria-label=\"设置\"");
    expect(html).toContain("aria-label=\"记忆\"");
    expect(html).toContain("首页");
    expect(html).toContain("历史");
    expect(html).toContain("设置");
    expect(html).toContain("记忆");
  });

  it("renders buffer items with weather as zero-minute context", () => {
    const html = renderToStaticMarkup(
      <BufferList
        buffers={[
          {
            id: "traffic",
            category: "traffic",
            label: "交通缓冲",
            minutes: 8,
            reason: "晚高峰环路拥堵",
          },
          {
            id: "weather",
            category: "weather",
            label: "天气参考",
            minutes: 0,
            reason: "到达前后可能有小雨",
          },
        ]}
      />
    );

    expect(html).toContain("交通缓冲");
    expect(html).toContain("8 分钟");
    expect(html).toContain("天气参考");
    expect(html).toContain("0 分钟");
    expect(html).toContain("到达前后可能有小雨");
  });

  it("renders route timeline segment titles", () => {
    const html = renderToStaticMarkup(
      <RouteTimeline
        segments={[
          {
            id: "walk",
            mode: "walk",
            title: "步行到地铁 4 号线",
            detail: "B 口进站",
            minutes: 5,
          },
          {
            id: "train",
            mode: "transit",
            title: "地铁 4 号线",
            detail: "向北 8 站",
            minutes: 20,
          },
        ]}
      />
    );

    expect(html).toContain("步行到地铁 4 号线");
    expect(html).toContain("地铁 4 号线");
  });

  it("renders grouped route timelines for multi-stop trips", () => {
    const html = renderToStaticMarkup(
      <RouteTimeline
        groups={[
          {
            id: "leg-a",
            title: "家到 A 站",
            subtitle: "08:40 前到达",
            segments: [
              {
                id: "metro-a",
                mode: "transit",
                title: "乘地铁到 A 站",
                detail: "6 站",
                minutes: 18,
              },
            ],
          },
          {
            id: "leg-b",
            title: "A 站到电影院",
            subtitle: "09:15 前到达",
            segments: [
              {
                id: "inside-b",
                mode: "destination",
                title: "在商场内步行",
                detail: "从 2 号门进入后前往 4 层",
                minutes: 7,
              },
            ],
          },
        ]}
        segments={[]}
      />
    );

    expect(html).toContain("家到 A 站");
    expect(html).toContain("A 站到电影院");
    expect(html).toContain("在商场内步行");
  });

  it("orders agent messages and tool calls chronologically", () => {
    const events = buildAgentEvents({
      messages: [
        {
          id: "assistant-late",
          role: "assistant",
          content: "已选择路线",
          createdAt: "2026-06-28T08:03:00.000Z",
        },
      ],
      toolCalls: [
        {
          id: "poi-early",
          name: "search_poi",
          status: "completed",
          createdAt: "2026-06-28T08:01:00.000Z",
        },
      ],
    });

    expect(events.map((event) => event.title)).toEqual([
      "搜索地点",
      "智能体更新",
    ]);
  });

  it("formats agent tool names for display", () => {
    expect(formatAgentToolName("get_weather_reference")).toBe("获取天气参考");
    expect(formatAgentToolName("create_trip")).toBe("创建行程");
    expect(formatAgentToolName("unknown_tool")).toBe("工具调用");
  });

  it("only auto-redirects completed agent sessions when enabled", () => {
    const state = getAgentSessionViewState({
      autoRedirect: true,
      session: { status: "completed", tripId: "trip-1" },
    });

    expect(state.redirectTo).toBe("/trips/trip-1");
    expect(state.redirectDelayMs).toBeGreaterThanOrEqual(750);
    expect(
      getAgentSessionViewState({
        autoRedirect: false,
        session: { status: "completed", tripId: "trip-1" },
      }).redirectTo
    ).toBeNull();
  });

  it("builds conversation links that do not auto-redirect completed sessions", () => {
    expect(getAgentConversationHref("session-1")).toBe(
      "/agent/session-1?view=conversation"
    );
  });

  it("marks failed agent sessions as terminal instead of loading", () => {
    const state = getAgentSessionViewState({
      autoRedirect: true,
      session: { status: "failed", tripId: null },
    });

    expect(state.isTerminal).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it("routes unauthenticated agent starts to login", () => {
    expect(getAgentStartResult(401, {})).toEqual({
      route: "/login",
      error: "",
    });
  });

  it("loads Inter from the root layout", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <main>App</main>
      </RootLayout>
    );

    expect(html).toContain("fonts.googleapis.com");
    expect(html).toContain("family=Inter");
  });

  it("renders a default origin selector without a visible coordinate input", () => {
    const html = renderToStaticMarkup(
      <SettingsForm
        values={{
          defaultCity: "宁波",
          timezone: "Asia/Shanghai",
          originName: "",
          originLngLat: "",
          routePreference: "balanced",
          telegramChatId: "",
          emailRecipient: "",
        }}
      />
    );

    expect(html).toContain("默认出发点");
    expect(html).toContain("通勤方式倾向");
    expect(html).toContain("公交地铁优先");
    expect(html).not.toContain("出发点坐标");
    expect(html).toContain('name="originLngLat"');
    expect(html).toContain('type="hidden"');
  });
});
