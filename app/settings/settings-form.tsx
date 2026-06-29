"use client";

import React, { FormEvent, useState } from "react";
import { ChevronDown, Loader2, Mail, Send } from "lucide-react";

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

const timezoneOptions = [["Asia/Shanghai", "北京时间（Asia/Shanghai）"]] as const;

type SelectFieldProps = {
  id: string;
  name: string;
  options: readonly (readonly [string, string])[];
  defaultValue: string;
};

function SelectField({ defaultValue, id, name, options }: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        className="w-full appearance-none rounded-2xl border border-white/70 bg-white/80 px-4 py-3 pr-11 text-base text-on-surface outline-none ring-primary/20 transition focus:ring-4"
        defaultValue={defaultValue}
        id={id}
        name={name}
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#434655]"
      />
    </div>
  );
}

type PlaceCandidate = {
  id: string;
  name: string;
  address: string;
  lngLat: string;
};

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState(values.telegramChatId);
  const [emailRecipient, setEmailRecipient] = useState(values.emailRecipient);
  const [telegramTestStatus, setTelegramTestStatus] = useState("");
  const [emailTestStatus, setEmailTestStatus] = useState("");
  const [testingChannel, setTestingChannel] = useState<"telegram" | "email" | null>(
    null
  );
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

  async function sendTestNotification(channel: "telegram" | "email") {
    if (testingChannel) {
      return;
    }

    if (channel === "telegram") {
      setTelegramTestStatus("");
    } else {
      setEmailTestStatus("");
    }

    setTestingChannel(channel);

    try {
      const response = await fetch("/api/settings/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          channel === "telegram"
            ? { channel, telegramChatId }
            : { channel, emailRecipient }
        ),
      });
      const payload = await response.json().catch(() => ({}));
      const ok = response.ok && payload.result?.status === "sent";
      const message =
        typeof payload.error === "string"
          ? payload.error
          : channel === "telegram"
            ? ok
              ? "Telegram 测试已发送"
              : "Telegram 测试未发送"
            : ok
              ? "邮件测试已发送"
              : "邮件测试未发送";

      if (channel === "telegram") {
        setTelegramTestStatus(message);
      } else {
        setEmailTestStatus(message);
      }
    } catch {
      if (channel === "telegram") {
        setTelegramTestStatus("Telegram 测试发送失败");
      } else {
        setEmailTestStatus("邮件测试发送失败");
      }
    } finally {
      setTestingChannel(null);
    }
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
          <SelectField
            defaultValue={values.timezone}
            id="timezone"
            name="timezone"
            options={timezoneOptions}
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
          <SelectField
            defaultValue={values.routePreference}
            id="routePreference"
            name="routePreference"
            options={routePreferenceOptions}
          />
        </label>

        <section className="grid gap-2 py-4 md:grid-cols-[160px_1fr] md:items-center">
          <span className="text-sm font-medium text-on-surface-variant">Telegram Chat ID</span>
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="Telegram Chat ID"
                className="min-w-0 flex-1 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-base text-on-surface outline-none ring-primary/20 transition focus:ring-4"
                id="telegramChatId"
                name="telegramChatId"
                onChange={(event) => setTelegramChatId(event.target.value)}
                value={telegramChatId}
              />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#dae2fd] px-4 py-3 text-sm font-semibold text-[#3f465c] transition hover:bg-[#bec6e0] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={testingChannel !== null}
                onClick={() => void sendTestNotification("telegram")}
                type="button"
              >
                {testingChannel === "telegram" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Send aria-hidden="true" className="size-4" />
                )}
                发送测试消息
              </button>
            </div>
            {telegramTestStatus ? (
              <p className="text-sm font-medium text-on-surface-variant">
                {telegramTestStatus}
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid gap-2 py-4 md:grid-cols-[160px_1fr] md:items-center">
          <span className="text-sm font-medium text-on-surface-variant">邮件接收人</span>
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="邮件接收人"
                className="min-w-0 flex-1 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-base text-on-surface outline-none ring-primary/20 transition focus:ring-4"
                id="emailRecipient"
                name="emailRecipient"
                onChange={(event) => setEmailRecipient(event.target.value)}
                value={emailRecipient}
              />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#dae2fd] px-4 py-3 text-sm font-semibold text-[#3f465c] transition hover:bg-[#bec6e0] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={testingChannel !== null}
                onClick={() => void sendTestNotification("email")}
                type="button"
              >
                {testingChannel === "email" ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Mail aria-hidden="true" className="size-4" />
                )}
                发送测试邮件
              </button>
            </div>
            {emailTestStatus ? (
              <p className="text-sm font-medium text-on-surface-variant">
                {emailTestStatus}
              </p>
            ) : null}
          </div>
        </section>
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
