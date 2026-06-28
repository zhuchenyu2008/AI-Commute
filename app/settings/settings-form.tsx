"use client";

import React, { FormEvent, useState } from "react";

type SettingsValues = {
  defaultCity: string;
  timezone: string;
  originName: string;
  originLngLat: string;
  routePreference: string;
  telegramChatId: string;
  emailRecipient: string;
};

const routePreferenceOptions = [
  ["balanced", "均衡"],
  ["fastest", "省时间优先"],
  ["habit", "贴近日常习惯"],
  ["transit", "公交地铁优先"],
  ["bike", "骑行优先"],
] as const;

type PlaceCandidate = {
  id: string;
  name: string;
  address: string;
  lngLat: string;
};

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [defaultCity, setDefaultCity] = useState(values.defaultCity);
  const [originName, setOriginName] = useState(values.originName);
  const [originLngLat, setOriginLngLat] = useState(values.originLngLat);
  const [originQuery, setOriginQuery] = useState(values.originName);
  const [places, setPlaces] = useState<PlaceCandidate[]>([]);
  const [placeStatus, setPlaceStatus] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    setIsSubmitting(false);
    setStatus(response.ok ? "已保存" : "保存失败");
  }

  async function searchPlaces() {
    const keywords = originQuery.trim();
    if (!keywords) {
      setPlaceStatus("请输入地点关键词");
      return;
    }

    setPlaceStatus("正在搜索");
    const response = await fetch(
      `/api/places/search?keywords=${encodeURIComponent(keywords)}&city=${encodeURIComponent(defaultCity)}`
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setPlaceStatus(payload.error ?? "地点搜索失败");
      return;
    }

    setPlaces(Array.isArray(payload.places) ? payload.places : []);
    setPlaceStatus("");
  }

  return (
    <form
      className="glass-card rounded-2xl p-6 shadow-xl shadow-slate-200/70"
      onSubmit={onSubmit}
    >
      <div className="divide-y divide-outline-variant/70">
        <label
          className="grid gap-2 py-4 md:grid-cols-[160px_1fr] md:items-center"
          htmlFor="defaultCity"
        >
          <span className="text-sm font-medium text-on-surface-variant">默认城市</span>
          <input
            className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-base text-on-surface outline-none ring-primary/20 transition focus:ring-4"
            id="defaultCity"
            name="defaultCity"
            onChange={(event) => setDefaultCity(event.target.value)}
            value={defaultCity}
          />
        </label>

        <label
          className="grid gap-2 py-4 md:grid-cols-[160px_1fr] md:items-center"
          htmlFor="timezone"
        >
          <span className="text-sm font-medium text-on-surface-variant">时区</span>
          <input
            className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-base text-on-surface outline-none ring-primary/20 transition focus:ring-4"
            defaultValue={values.timezone}
            id="timezone"
            name="timezone"
          />
        </label>

        <section className="grid gap-3 py-4 md:grid-cols-[160px_1fr] md:items-start">
          <span className="text-sm font-medium text-on-surface-variant">默认出发点</span>
          <div className="space-y-3">
            <input name="originName" type="hidden" value={originName} />
            <input name="originLngLat" type="hidden" value={originLngLat} />
            <div className="flex gap-2">
              <input
                aria-label="搜索默认出发点"
                className="min-w-0 flex-1 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-base text-on-surface outline-none ring-primary/20 transition focus:ring-4"
                onChange={(event) => setOriginQuery(event.target.value)}
                placeholder="搜索地点，例如外事学校"
                type="search"
                value={originQuery}
              />
              <button
                className="rounded-2xl bg-[#2563eb] px-4 py-3 text-sm font-semibold text-white"
                onClick={searchPlaces}
                type="button"
              >
                搜索
              </button>
            </div>
            {originName ? (
              <p className="text-sm font-semibold text-[#191c1e]">已选择：{originName}</p>
            ) : (
              <p className="text-sm font-medium text-on-surface-variant">
                请从候选地点中选择默认出发点。
              </p>
            )}
            {placeStatus ? (
              <p className="text-sm font-medium text-on-surface-variant">{placeStatus}</p>
            ) : null}
            <div className="space-y-2">
              {places.map((place) => (
                <button
                  className="w-full rounded-2xl bg-white/70 px-4 py-3 text-left text-sm text-[#191c1e]"
                  key={place.id}
                  onClick={() => {
                    setOriginName(place.name);
                    setOriginLngLat(place.lngLat);
                    setOriginQuery(place.name);
                  }}
                  type="button"
                >
                  <span className="block font-bold">{place.name}</span>
                  <span className="block text-xs text-[#434655]">
                    {place.address || place.lngLat}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <label
          className="grid gap-2 py-4 md:grid-cols-[160px_1fr] md:items-center"
          htmlFor="routePreference"
        >
          <span className="text-sm font-medium text-on-surface-variant">通勤方式倾向</span>
          <select
            className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-base text-on-surface outline-none ring-primary/20 transition focus:ring-4"
            defaultValue={values.routePreference}
            id="routePreference"
            name="routePreference"
          >
            {routePreferenceOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label
          className="grid gap-2 py-4 md:grid-cols-[160px_1fr] md:items-center"
          htmlFor="telegramChatId"
        >
          <span className="text-sm font-medium text-on-surface-variant">Telegram Chat ID</span>
          <input
            className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-base text-on-surface outline-none ring-primary/20 transition focus:ring-4"
            defaultValue={values.telegramChatId}
            id="telegramChatId"
            name="telegramChatId"
          />
        </label>

        <label
          className="grid gap-2 py-4 md:grid-cols-[160px_1fr] md:items-center"
          htmlFor="emailRecipient"
        >
          <span className="text-sm font-medium text-on-surface-variant">邮件接收人</span>
          <input
            className="w-full rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-base text-on-surface outline-none ring-primary/20 transition focus:ring-4"
            defaultValue={values.emailRecipient}
            id="emailRecipient"
            name="emailRecipient"
          />
        </label>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-on-surface-variant" role="status">
          {status}
        </p>
        <button
          className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          保存
        </button>
      </div>
    </form>
  );
}
