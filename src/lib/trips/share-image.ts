export const SHARE_CARD_LOGICAL_WIDTH = 540;
export const SHARE_CARD_CONTENT_MIN_HEIGHT = 540;
export const SHARE_CARD_FOOTER_HEIGHT = 108;
export const SHARE_CARD_MIN_HEIGHT =
  SHARE_CARD_CONTENT_MIN_HEIGHT + SHARE_CARD_FOOTER_HEIGHT;
export const SHARE_CARD_MAX_HEIGHT = 960;
export const SHARE_CARD_MAX_CONTENT_HEIGHT =
  SHARE_CARD_MAX_HEIGHT - SHARE_CARD_FOOTER_HEIGHT;
export const SHARE_CARD_PIXEL_RATIO = 2;

export type ShareCardLayout = {
  logicalHeight: number;
  visibleSegmentCount: number;
  hiddenSegmentCount: number;
};

export type ShareCardTextMetrics = {
  titleLength: number;
  finalStopLength: number;
  segmentCount: number;
  segmentTextLength: number;
};

export function getShareCardFontScale(metrics: ShareCardTextMetrics) {
  const titleLength = Math.max(0, metrics.titleLength);
  const finalStopLength = Math.max(0, metrics.finalStopLength);
  const segmentCount = Math.max(0, metrics.segmentCount);
  const segmentTextLength = Math.max(0, metrics.segmentTextLength);
  const contentLoad =
    titleLength * 1.2 +
    finalStopLength * 0.8 +
    segmentTextLength * 0.7 +
    segmentCount * 36;

  if (contentLoad <= 220) return 1.14;
  if (contentLoad <= 400) return 1.05;
  if (contentLoad <= 650) return 0.98;
  return 0.9;
}

export function getShareCardLayout(segmentCount: number): ShareCardLayout {
  const safeCount = Math.max(0, Math.floor(segmentCount));
  return {
    logicalHeight: SHARE_CARD_MIN_HEIGHT,
    visibleSegmentCount: safeCount,
    hiddenSegmentCount: 0,
  };
}

export function getShareCardCaptureHeight(measuredHeight: number) {
  const safeHeight =
    Number.isFinite(measuredHeight) && measuredHeight > 0
      ? Math.ceil(measuredHeight)
      : SHARE_CARD_MIN_HEIGHT;

  return Math.min(
    SHARE_CARD_MAX_HEIGHT,
    Math.max(SHARE_CARD_MIN_HEIGHT, safeHeight)
  );
}

export function buildShareImageFileName(title: string, now = new Date()) {
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((item) => item.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const safeTitle =
    title.replace(/[\\/:*?"<>|\s]+/g, "").slice(0, 40) || "行程";

  return `AI-Commute-${safeTitle}-${date}.png`;
}
