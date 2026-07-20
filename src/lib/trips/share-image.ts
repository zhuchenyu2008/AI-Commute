export const SHARE_CARD_LOGICAL_WIDTH = 540;
export const SHARE_CARD_MIN_HEIGHT = 540;
export const SHARE_CARD_MAX_HEIGHT = 960;
export const SHARE_CARD_PIXEL_RATIO = 2;
export const SHARE_CARD_MAX_SEGMENTS = 8;

export type ShareCardLayout = {
  logicalHeight: number;
  visibleSegmentCount: number;
  hiddenSegmentCount: number;
};

export function getShareCardLayout(segmentCount: number): ShareCardLayout {
  const safeCount = Math.max(0, Math.floor(segmentCount));
  const visibleSegmentCount = Math.min(safeCount, SHARE_CARD_MAX_SEGMENTS);
  const hiddenSegmentCount = safeCount - visibleSegmentCount;
  const logicalHeight = Math.min(
    SHARE_CARD_MAX_HEIGHT,
    Math.max(
      SHARE_CARD_MIN_HEIGHT,
      SHARE_CARD_MIN_HEIGHT + Math.max(0, visibleSegmentCount - 4) * 90
    )
  );

  return { logicalHeight, visibleSegmentCount, hiddenSegmentCount };
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
