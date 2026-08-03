import { describe, expect, it } from "vitest";
import {
  assertTravelPlanAttractionCoverage,
  normalizeTravelPlan,
  parseTravelPlanJson,
} from "@/lib/trips/travel-plan";

const sampleTravelPlan = {
  destination: "宁波",
  summary: "两天旅行规划",
  days: "2",
  weather: {
    city: "宁波",
    summary: "多云，24°C",
    advice: "自然景点留意降雨",
    source: "高德天气参考",
    dynamicMonitoring: true,
    refreshPolicy: "出发前和每次路线复查",
    forecast: [
      {
        date: "2026-08-03",
        day: 1,
        summary: "多云，24°C",
        risk: "low",
        drivingAdvice: "出发前复查路况",
      },
    ],
    routeRisks: [
      {
        legOrder: 1,
        route: "北京到宁波",
        summary: "天气稳定",
        risk: "low",
        drivingAdvice: "保留公共交通备选",
      },
    ],
  },
  transport: {
    recommended: "driving",
    reason: "郊区串联更方便",
    driving: {
      summary: "约 36 分钟",
      reason: "适合携带行李",
      durationMinutes: "36",
      route: "驾车路线来自高德",
    },
    transit: {
      summary: "约 50 分钟",
      reason: "市区停车压力小",
      durationMinutes: 50,
    },
    localMovement: "市内景点优先公共交通",
  },
  attractions: [
    {
      name: "东钱湖",
      category: "nature",
      reason: "适合半日自然游",
      day: "1",
      stayMinutes: 180,
    },
    {
      name: "四明山",
      category: "natural",
      reason: "山林自然景观",
      day: 1,
    },
    {
      name: "松兰山",
      category: "natural",
      reason: "滨海自然景观",
      day: 2,
    },
    {
      name: "天一阁",
      category: "cultural",
      reason: "补足历史人文内容",
      day: 2,
    },
  ],
  lodging: [
    {
      name: "市中心住宿区",
      area: "鼓楼周边",
      reason: "交通和餐饮集中",
    },
  ],
  food: [
    {
      name: "宁波本帮菜",
      mustTry: "海鲜和汤圆",
      reason: "代表本地口味",
    },
  ],
  pitfalls: [
    {
      title: "提前预约",
      detail: "热门景点先查官方公告",
      severity: "high",
    },
  ],
};

describe("travel plan normalization", () => {
  it("normalizes agent JSON into the persisted display shape", () => {
    expect(normalizeTravelPlan(sampleTravelPlan)).toMatchObject({
      destination: "宁波",
      days: 2,
      transport: {
        recommended: "driving",
        driving: { durationMinutes: 36 },
      },
      weather: {
        dynamicMonitoring: true,
        forecast: [{ summary: "多云，24°C", risk: "low" }],
      },
    });
    expect(normalizeTravelPlan(sampleTravelPlan).attractions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "东钱湖",
          category: "natural",
          day: 1,
        }),
        expect.objectContaining({
          name: "天一阁",
          category: "cultural",
          day: 2,
        }),
      ])
    );
  });

  it("requires a broad natural-attraction candidate set for travel creation", () => {
    const plan = normalizeTravelPlan(sampleTravelPlan);

    expect(() => assertTravelPlanAttractionCoverage(plan)).not.toThrow();
    expect(() =>
      assertTravelPlanAttractionCoverage({
        ...plan,
        attractions: plan.attractions.filter(
          (attraction) => attraction.category !== "natural"
        ),
      })
    ).toThrow("至少需要 3 个自然景观");
  });

  it("rejects incomplete plans and safely hides invalid persisted JSON", () => {
    expect(
      () =>
        normalizeTravelPlan({
          destination: "宁波",
          summary: "",
          weather: {},
          transport: { recommended: "driving" },
        })
    ).toThrow("travelPlan.summary");
    expect(parseTravelPlanJson("not-json")).toBeNull();
    expect(parseTravelPlanJson(null)).toBeNull();
  });
});
