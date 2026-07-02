import {
  buildEmailIconAttachments,
  emailIconImg,
  type EmailIconId,
} from "./email-icons";
import type { EmailAttachment } from "./email";

export type CommuteEmailTemplateInput = {
  appName?: string;
  tripTitle: string;
  destinationName: string;
  destinationAddress?: string | null;
  latestDepartAt?: Date | null;
  previousLatestDepartAt?: Date | null;
  targetArriveAt?: Date | null;
  totalMinutes?: number | null;
  routeTitle?: string | null;
  weatherSummary?: string | null;
  detailsUrl?: string;
  stopMonitoringUrl?: string;
};

export type RouteChangeEmailTemplateInput = CommuteEmailTemplateInput & {
  changeMinutes: number;
};

export type BuiltEmailTemplate = {
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
};

const DEFAULT_APP_NAME = "AI Commute";
const PRIMARY = "#2563eb";
const PRIMARY_DARK = "#004ac6";
const TEXT = "#191c1e";
const MUTED = "#434655";
const OUTLINE = "#d8dde8";
const SURFACE_LOW = "#f2f4f6";
const SURFACE_CARD = "#ffffff";
const ERROR = "#EF4444";
const ERROR_CONTAINER = "#ffdad6";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBeijingTime(date: Date | null | undefined) {
  if (!date) return "待确认";

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function timeDisplayHtml(value: string, color: string) {
  const escapedValue = escapeHtml(value);
  const style = `color:${color} !important;text-decoration:none !important;border-bottom:0 !important;white-space:nowrap;`;
  const parts = value.split(":");

  if (parts.length !== 2) {
    return `<span class="commute-time" style="${style}">${escapedValue}</span>`;
  }

  return `<span class="commute-time" aria-label="${escapedValue}" style="${style}"><span style="${style}">${escapeHtml(parts[0])}</span><span style="${style}">&#8288;:&#8288;</span><span style="${style}">${escapeHtml(parts[1])}</span></span>`;
}

function formatBeijingTimeHtml(date: Date | null | undefined, color: string) {
  return timeDisplayHtml(formatBeijingTime(date), color);
}

function roundedMinutes(minutes: number | null | undefined) {
  return typeof minutes === "number" && Number.isFinite(minutes)
    ? Math.round(minutes)
    : null;
}

function formatMinutes(minutes: number | null | undefined) {
  const value = roundedMinutes(minutes);

  return value === null ? "待确认" : `${value} 分钟`;
}

function normalizeHttpUrl(url: string | undefined) {
  const trimmed = url?.trim();

  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);

    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function resolveAppName(input: CommuteEmailTemplateInput) {
  return input.appName?.trim() || DEFAULT_APP_NAME;
}

function valueOrPending(value: string | null | undefined) {
  return value?.trim() || "待确认";
}

function baseContainer({
  title,
  innerHtml,
  maxWidth,
  background = "#ffffff",
  verticalMargin = 0,
}: {
  title: string;
  innerHtml: string;
  maxWidth: number;
  background?: string;
  verticalMargin?: number;
}) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
    <title>${escapeHtml(title)}</title>
    <style>
      a[x-apple-data-detectors] {
        color: inherit !important;
        text-decoration: none !important;
        border-bottom: 0 !important;
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${background};font-family:Arial,'Microsoft YaHei',sans-serif;color:${TEXT};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:${background};table-layout:fixed;">
      <tr>
        <td align="center" style="padding:${verticalMargin}px 12px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${maxWidth}px;margin:0 auto;border-collapse:collapse;background:#ffffff;table-layout:fixed;">
            <tr>
              <td style="padding:0;">
                ${innerHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function emailTopBar(appName: string) {
  return `
    <tr>
      <td style="padding:16px 20px;border-bottom:1px solid ${OUTLINE};background:#ffffff;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <tr>
            <td valign="middle" style="padding:0;color:${PRIMARY_DARK};font-size:14px;line-height:20px;font-weight:700;letter-spacing:0.05em;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td width="34" valign="middle" style="width:34px;padding:0;">${emailIconImg("route-primary", { alt: "", width: 24, height: 24 })}</td>
                  <td valign="middle" style="font-size:14px;line-height:20px;font-weight:700;color:${PRIMARY_DARK};letter-spacing:0.05em;">行程提醒</td>
                </tr>
              </table>
            </td>
            <td valign="middle" align="right" style="padding:0;text-align:right;font-size:16px;line-height:24px;font-weight:700;color:${MUTED};word-break:break-word;">${escapeHtml(appName)}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function routeParts(routeTitle: string | null | undefined) {
  const parts = valueOrPending(routeTitle)
    .split(/\s*(?:->|→|到)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    primary: parts[0] ?? valueOrPending(routeTitle),
    secondary: parts[1] ?? "",
  };
}

function weatherParts(weatherSummary: string | null | undefined) {
  const summary = valueOrPending(weatherSummary);
  const match = summary.match(/^(-?\d+\s*(?:°C|℃|度C|度)?)(?:\s+(.+))?$/i);

  if (!match) {
    return { temperature: summary, condition: "" };
  }

  return {
    temperature: match[1].replace(/\s+/g, "").replace("℃", "°C"),
    condition: match[2]?.trim() ?? "",
  };
}

function departureFactRow(
  icon: EmailIconId,
  label: string,
  value: string,
  withDivider = true,
  valueHtml = escapeHtml(value)
) {
  return `
    <tr>
      <td width="28" valign="top" style="width:28px;padding:${withDivider ? "0 0 16px" : "0"};${withDivider ? `border-bottom:1px solid ${OUTLINE};` : ""}">
        ${emailIconImg(icon, { alt: "", width: 24, height: 24 })}
      </td>
      <td valign="top" style="padding:${withDivider ? "0 0 16px" : "0"};${withDivider ? `border-bottom:1px solid ${OUTLINE};` : ""}">
        <div style="font-size:12px;line-height:16px;color:${MUTED};letter-spacing:0.05em;">${escapeHtml(label)}</div>
        <div style="font-size:18px;line-height:28px;font-weight:700;color:${TEXT};word-break:break-word;">${valueHtml}</div>
      </td>
    </tr>`;
}

function routeWeatherCards(input: CommuteEmailTemplateInput) {
  const route = routeParts(input.routeTitle);
  const weather = weatherParts(input.weatherSummary);
  const secondaryRoute = route.secondary
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:8px;">
        <tr>
          <td width="28" valign="middle" style="width:28px;padding:0;">${emailIconImg("bike-muted", { alt: "", width: 18, height: 18 })}</td>
          <td valign="middle" style="font-size:16px;line-height:24px;color:${MUTED};word-break:break-word;">${escapeHtml(route.secondary)}</td>
        </tr>
      </table>`
    : "";
  const weatherCondition = weather.condition
    ? `<div style="font-size:14px;line-height:20px;color:${MUTED};word-break:break-word;">${escapeHtml(weather.condition)}</div>`
    : "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:32px;">
      <tr>
        <td width="50%" valign="top" style="width:50%;padding-right:8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid ${OUTLINE};border-radius:12px;table-layout:fixed;">
            <tr>
              <td style="padding:16px;">
                <div style="font-size:14px;line-height:20px;color:${MUTED};margin-bottom:16px;">推荐路线</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td width="30" valign="middle" style="width:30px;padding:0;">${emailIconImg("train-primary", { alt: "", width: 20, height: 20 })}</td>
                    <td valign="middle" style="font-size:16px;line-height:24px;font-weight:700;color:${TEXT};word-break:break-word;">${escapeHtml(route.primary)}</td>
                  </tr>
                </table>
                ${secondaryRoute}
              </td>
            </tr>
          </table>
        </td>
        <td width="50%" valign="top" style="width:50%;padding-left:8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid ${OUTLINE};border-radius:12px;table-layout:fixed;">
            <tr>
              <td style="padding:16px;">
                <div style="font-size:14px;line-height:20px;color:${MUTED};margin-bottom:16px;">目的地天气</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td width="44" valign="middle" style="width:44px;padding:0;">${emailIconImg("rain-primary", { alt: "", width: 32, height: 32 })}</td>
                    <td valign="middle">
                      <div style="font-size:18px;line-height:28px;font-weight:700;color:${TEXT};word-break:break-word;">${escapeHtml(weather.temperature)}</div>
                      ${weatherCondition}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function actionAndFooterBlock(
  input: CommuteEmailTemplateInput,
  footerText: string,
  variant: "plain" | "band" = "plain"
) {
  const detailsUrl = normalizeHttpUrl(input.detailsUrl);
  const stopMonitoringUrl = normalizeHttpUrl(input.stopMonitoringUrl);
  const ctaRadius = variant === "band" ? "12px" : "9999px";
  const ctaMargin = variant === "band" ? 30 : 40;
  const cta = detailsUrl
    ? `
      <div style="margin-top:${ctaMargin}px;mso-line-height-rule:exactly;">
        <a href="${escapeHtml(detailsUrl)}" style="display:block;width:100%;box-sizing:border-box;background:${PRIMARY};color:#ffffff;text-align:center;text-decoration:none;font-size:14px;font-weight:700;line-height:20px;padding:16px 24px;border-radius:${ctaRadius};box-shadow:0 8px 18px rgba(37,99,235,0.22);">查看实时地图</a>
      </div>`
    : "";
  const stopLink = stopMonitoringUrl
    ? `<a href="${escapeHtml(stopMonitoringUrl)}" style="display:inline-block;margin-top:18px;color:${variant === "band" ? PRIMARY_DARK : MUTED};text-decoration:underline;">停止监控此路线</a>`
    : "";

  if (variant === "band") {
    return `
      ${cta}
      <div style="margin:50px -20px 0;padding:24px 20px;background:${SURFACE_LOW};border-top:1px solid ${OUTLINE};text-align:center;font-size:12px;line-height:16px;color:${MUTED};">
        <div>${escapeHtml(footerText)}</div>
        ${stopLink}
      </div>`;
  }

  return `
    ${cta}
    <div style="margin-top:30px;text-align:center;font-size:12px;line-height:16px;color:${MUTED};">
      <div>${escapeHtml(footerText)}</div>
      ${stopLink}
    </div>`;
}

function buildPlainText(
  brand: string | null,
  heading: string,
  input: CommuteEmailTemplateInput,
  intro?: string
) {
  const detailsUrl = normalizeHttpUrl(input.detailsUrl);
  const stopMonitoringUrl = normalizeHttpUrl(input.stopMonitoringUrl);
  const lines = [
    brand,
    heading,
    intro,
    `行程：${input.tripTitle}`,
    `最晚出发时间：${formatBeijingTime(input.latestDepartAt)}`,
    `预计到达时间：${formatBeijingTime(input.targetArriveAt)}`,
    `预计通勤时长：${formatMinutes(input.totalMinutes)}`,
    `目的地：${input.destinationName}`,
    `地址：${valueOrPending(input.destinationAddress)}`,
    `路线：${valueOrPending(input.routeTitle)}`,
    `天气：${valueOrPending(input.weatherSummary)}`,
    detailsUrl ? `查看实时地图：${detailsUrl}` : null,
    stopMonitoringUrl ? `停止监控：${stopMonitoringUrl}` : null,
  ];

  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export function buildDepartureReminderEmail(
  input: CommuteEmailTemplateInput
): BuiltEmailTemplate {
  const appName = resolveAppName(input);
  const html = baseContainer({
    title: "通勤提醒：该出发了",
    maxWidth: 448,
    verticalMargin: 0,
    innerHtml: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">
        ${emailTopBar(appName)}
        <tr>
          <td style="padding:32px 24px 40px;">
            <div style="text-align:center;">
              <div style="font-size:14px;line-height:20px;font-weight:700;color:${MUTED};letter-spacing:0.12em;">行程提醒</div>
              <h1 style="margin:8px 0 8px;font-size:28px;line-height:34px;font-weight:700;color:${PRIMARY_DARK};">该出发了！</h1>
              <div style="font-size:16px;line-height:24px;color:${MUTED};">最晚出发时间: <strong style="color:${TEXT};font-weight:700;">${formatBeijingTimeHtml(input.latestDepartAt, TEXT)}</strong></div>
            </div>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;margin-top:40px;background:${SURFACE_LOW};border-radius:12px;">
              <tr>
                <td style="padding:24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">
                    ${departureFactRow("clock-muted", "预计到达时间", formatBeijingTime(input.targetArriveAt), true, formatBeijingTimeHtml(input.targetArriveAt, TEXT))}
                    <tr><td colspan="2" height="14" style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>
                    ${departureFactRow("timer-muted", "预计行程时间", formatMinutes(input.totalMinutes))}
                    <tr><td colspan="2" height="14" style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>
                    ${departureFactRow("pin-muted", "目的地", input.destinationName, false)}
                  </table>
                </td>
              </tr>
            </table>

            ${routeWeatherCards(input)}
            ${actionAndFooterBlock(input, "此为自动发送的行程提醒邮件。")}
          </td>
        </tr>
      </table>
    `,
  });

  return {
    subject: "通勤提醒：该出发了",
    text: buildPlainText(appName, "该出发了", input),
    html,
    attachments: buildEmailIconAttachments([
      "route-primary",
      "clock-muted",
      "timer-muted",
      "pin-muted",
      "train-primary",
      "bike-muted",
      "rain-primary",
    ]),
  };
}

function durationHtml(minutes: number | null | undefined) {
  const value = roundedMinutes(minutes);

  if (value === null) return "待确认";

  return `${value} <span style="font-size:16px;line-height:24px;font-weight:400;color:${MUTED};">分钟</span>`;
}

function routeChangeDetailCard(input: CommuteEmailTemplateInput) {
  const route = routeParts(input.routeTitle);
  const weather = weatherParts(input.weatherSummary);
  const routeLine = route.secondary
    ? `${escapeHtml(route.primary)} <span style="color:${MUTED};padding:0 8px;">→</span><span>${escapeHtml(route.secondary)}</span>`
    : escapeHtml(route.primary);

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;margin-top:24px;border-radius:8px;background:${SURFACE_CARD};box-shadow:0 4px 12px rgba(0,0,0,0.05);">
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid ${OUTLINE};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">
            <tr>
              <td valign="top" style="padding:0 12px 0 0;">
                <div style="font-size:12px;line-height:16px;color:${MUTED};letter-spacing:0.05em;">目的地</div>
                <div style="margin-top:6px;font-size:18px;line-height:28px;font-weight:700;color:${TEXT};word-break:break-word;">${escapeHtml(input.destinationName)}</div>
                <div style="margin-top:2px;font-size:14px;line-height:20px;color:${MUTED};word-break:break-word;">${escapeHtml(valueOrPending(input.destinationAddress))}</div>
              </td>
              <td width="48" valign="top" align="right" style="width:48px;padding:0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;border-radius:9999px;background:#eef0f3;">
                  <tr>
                    <td width="48" height="48" align="center" valign="middle" style="width:48px;height:48px;text-align:center;vertical-align:middle;">
                      ${emailIconImg("building-primary", {
                        alt: "",
                        width: 28,
                        height: 28,
                        style: "margin:0 auto;",
                      })}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">
            <tr>
              <td width="62%" valign="top" style="width:62%;padding-right:12px;">
                <div style="font-size:12px;line-height:16px;color:${MUTED};letter-spacing:0.05em;">推荐路线</div>
                <div style="margin-top:6px;font-size:16px;line-height:24px;color:${TEXT};word-break:break-word;">
                  <span style="color:${PRIMARY_DARK};font-weight:700;">${routeLine}</span>
                </div>
              </td>
              <td width="38%" valign="top" align="right" style="width:38%;text-align:right;">
                <div style="font-size:12px;line-height:16px;color:${MUTED};letter-spacing:0.05em;">目的地天气</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="border-collapse:collapse;margin-top:6px;">
                  <tr>
                    <td width="28" valign="middle" style="width:28px;padding:0;">${emailIconImg("sun-cloud-primary", { alt: "", width: 22, height: 22 })}</td>
                    <td valign="middle" style="font-size:16px;line-height:24px;color:${TEXT};word-break:break-word;">${escapeHtml(weather.temperature)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

export function buildRouteChangeEmail(
  input: RouteChangeEmailTemplateInput
): BuiltEmailTemplate {
  const appName = resolveAppName(input);
  const roundedChangeMinutes = Math.round(Math.abs(input.changeMinutes));
  const textChange = `受路况影响，出发时间变化约 ${roundedChangeMinutes} 分钟`;
  const badgeChange = `受路况影响，出发时间延后 ${roundedChangeMinutes} 分钟`;
  const previousDepartAt = formatBeijingTime(input.previousLatestDepartAt);
  const plainTextIntro = [
    textChange,
    `原最晚出发时间：${previousDepartAt}`,
  ].join("\n");
  const html = baseContainer({
    title: `通勤时间已变化：${input.tripTitle}`,
    maxWidth: 600,
    background: "#f7f9fb",
    innerHtml: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">
        ${emailTopBar(appName)}
        <tr>
          <td style="padding:34px 20px 0;">
            <div style="text-align:center;">
              <h1 style="margin:0;font-size:28px;line-height:34px;font-weight:700;color:${TEXT};">出发时间已更新</h1>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;border-spacing:0;margin:8px auto 0;border-radius:9999px;background:${ERROR_CONTAINER};">
                <tr>
                  <td style="padding:4px 6px 4px 14px;">${emailIconImg("clock-error", { alt: "", width: 16, height: 16 })}</td>
                  <td style="padding:4px 14px 4px 0;color:${ERROR};font-size:12px;line-height:16px;">${escapeHtml(badgeChange)}</td>
                </tr>
              </table>
              <div style="margin-top:14px;font-size:16px;line-height:24px;color:${MUTED};">最晚出发时间</div>
              <div style="margin-top:4px;font-size:56px;line-height:64px;font-weight:700;color:${ERROR};">${formatBeijingTimeHtml(input.latestDepartAt, ERROR)}</div>
            </div>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:34px;">
              <tr>
                <td width="50%" valign="top" style="width:50%;padding-right:8px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;border-radius:8px;background:${SURFACE_CARD};box-shadow:0 4px 12px rgba(0,0,0,0.05);">
                    <tr>
                      <td style="padding:12px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                          <tr>
                            <td width="22" valign="middle" style="width:22px;padding:0;">${emailIconImg("flag-muted", { alt: "", width: 16, height: 16 })}</td>
                            <td valign="middle" style="color:${MUTED};font-size:12px;line-height:16px;">预计到达时间</td>
                          </tr>
                        </table>
                        <div style="margin-top:6px;font-size:24px;line-height:32px;font-weight:700;color:${TEXT};">${formatBeijingTimeHtml(input.targetArriveAt, TEXT)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
                <td width="50%" valign="top" style="width:50%;padding-left:8px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;border-radius:8px;background:${SURFACE_CARD};box-shadow:0 4px 12px rgba(0,0,0,0.05);">
                    <tr>
                      <td style="padding:12px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                          <tr>
                            <td width="22" valign="middle" style="width:22px;padding:0;">${emailIconImg("timer-muted-small", { alt: "", width: 16, height: 16 })}</td>
                            <td valign="middle" style="color:${MUTED};font-size:12px;line-height:16px;">预计行程时间</td>
                          </tr>
                        </table>
                        <div style="margin-top:6px;font-size:24px;line-height:32px;font-weight:700;color:${TEXT};">${durationHtml(input.totalMinutes)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            ${routeChangeDetailCard(input)}
            ${actionAndFooterBlock(input, "此为自动发送的行程复查邮件。", "band")}
          </td>
        </tr>
      </table>
    `,
  });

  return {
    subject: `通勤时间已变化：${input.tripTitle}`,
    text: buildPlainText(appName, "出发时间已更新", input, plainTextIntro),
    html,
    attachments: buildEmailIconAttachments([
      "route-primary",
      "clock-error",
      "flag-muted",
      "timer-muted-small",
      "building-primary",
      "sun-cloud-primary",
    ]),
  };
}
