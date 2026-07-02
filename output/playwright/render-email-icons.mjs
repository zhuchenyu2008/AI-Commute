import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const paths = {
  commute:
    '<rect x="3" y="7" width="10" height="8" rx="2"/><path d="M7 15v2M12 15v2M13 10h4l3 3v4h-3"/><path d="M15 17h2"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/>',
  route:
    '<path d="M6 4v14"/><circle cx="6" cy="4" r="2"/><circle cx="6" cy="20" r="2"/><path d="M18 4c-4 0-4 4-4 8s0 8-4 8"/><circle cx="18" cy="4" r="2"/>',
  clock:
    '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 3"/>',
  timer:
    '<circle cx="12" cy="13" r="7"/><path d="M12 6V3M9 3h6M12 13V9"/>',
  pin:
    '<path d="M12 21s7-5.1 7-11a7 7 0 0 0-14 0c0 5.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.2"/>',
  train:
    '<rect x="6" y="4" width="12" height="13" rx="2"/><path d="M9 8h6M8 13h8M9 20l2-3M15 20l-2-3"/>',
  bike:
    '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M8.5 17 12 10l3 7M12 10h3M10 7h3"/>',
  rain:
    '<path d="M7 16a4 4 0 1 1 1.1-7.85A5.5 5.5 0 0 1 19 10.5 3.5 3.5 0 0 1 18 17H7Z"/><path d="M8 20v1M12 20v1M16 20v1"/>',
  flag:
    '<path d="M6 21V5"/><path d="M6 5h10l-1.5 4L16 13H6"/>',
  building:
    '<path d="M4 21h16"/><path d="M6 21V5h8v16"/><path d="M14 9h4v12"/><path d="M9 8h2M9 12h2M9 16h2"/>',
  sunCloud:
    '<path d="M12 3v2M4.2 6.2l1.4 1.4M3 14h2M18.4 7.6l1.4-1.4"/><circle cx="12" cy="12" r="4"/><path d="M8 18h9a3 3 0 0 0 .6-5.94A4.5 4.5 0 0 0 9.1 14 3 3 0 0 0 8 18Z"/>',
};

const icons = [
  { id: "commute-brand", icon: "commute", color: "#ffffff", size: 32, bg: "#004ac6", stroke: 2.2 },
  { id: "route-primary", icon: "route", color: "#004ac6", size: 24, stroke: 2.2 },
  { id: "clock-muted", icon: "clock", color: "#737686", size: 24, stroke: 2 },
  { id: "timer-muted", icon: "timer", color: "#737686", size: 24, stroke: 2 },
  { id: "pin-muted", icon: "pin", color: "#737686", size: 24, stroke: 2 },
  { id: "train-primary", icon: "train", color: "#004ac6", size: 20, stroke: 2.2 },
  { id: "bike-muted", icon: "bike", color: "#434655", size: 18, stroke: 2 },
  { id: "rain-primary", icon: "rain", color: "#004ac6", size: 32, stroke: 2.2 },
  { id: "clock-error", icon: "clock", color: "#EF4444", size: 16, stroke: 2 },
  { id: "flag-muted", icon: "flag", color: "#434655", size: 16, stroke: 2 },
  { id: "timer-muted-small", icon: "timer", color: "#434655", size: 16, stroke: 2 },
  { id: "building-primary", icon: "building", color: "#004ac6", size: 28, stroke: 2.2 },
  { id: "sun-cloud-primary", icon: "sunCloud", color: "#004ac6", size: 22, stroke: 2.2 },
];

function svgFor(icon) {
  const content = icon.bg
    ? `<circle cx="12" cy="12" r="12" fill="${icon.bg}"/><g transform="translate(2 2) scale(.833333)" fill="none" stroke="${icon.color}" stroke-width="${icon.stroke}" stroke-linecap="round" stroke-linejoin="round">${paths[icon.icon]}</g>`
    : `<g fill="none" stroke="${icon.color}" stroke-width="${icon.stroke}" stroke-linecap="round" stroke-linejoin="round">${paths[icon.icon]}</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${icon.size}" height="${icon.size}" viewBox="0 0 24 24">${content}</svg>`;
}

const browser = await chromium.launch();
const output = {};

for (const icon of icons) {
  const page = await browser.newPage({
    viewport: { width: 80, height: 80 },
    deviceScaleFactor: 4,
  });

  await page.setContent(
    `<html><body style="margin:0;background:transparent;">${svgFor(icon)}</body></html>`
  );

  const png = await page.locator("svg").screenshot({ omitBackground: true });
  output[icon.id] = {
    filename: `${icon.id}.png`,
    cid: `${icon.id}@ai-commute`,
    contentType: "image/png",
    width: icon.size,
    height: icon.size,
    base64: png.toString("base64"),
  };

  await page.close();
}

await browser.close();
await writeFile(
  join(process.cwd(), "output", "playwright", "email-icons.json"),
  JSON.stringify(output, null, 2)
);

