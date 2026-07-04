const BEIJING_TIME_ZONE = "Asia/Shanghai";
const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: BEIJING_TIME_ZONE,
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

export function getBeijingDateInputValue(now = new Date()) {
  const { year, month, day } = getDateParts(now);
  return `${year}-${month}-${day}`;
}

function normalizeDateInput(value: string | null | undefined, now = new Date()) {
  const trimmed = value?.trim() ?? "";
  return isDateInputValue(trimmed) ? trimmed : getBeijingDateInputValue(now);
}

export function getBeijingDayRange(value?: string | null, now = new Date()) {
  const normalized = normalizeDateInput(value, now);
  const [year, month, day] = normalized.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    start,
    end,
    value: normalized,
  };
}

type BeijingDayRange = ReturnType<typeof getBeijingDayRange>;

export function getTripHistoryDateWhere(dayRange: BeijingDayRange) {
  return {
    targetArriveAt: {
      gte: dayRange.start,
      lt: dayRange.end,
    },
  };
}

export function getTripHistoryOrderBy() {
  return [{ targetArriveAt: "desc" as const }, { createdAt: "desc" as const }];
}

export function isDateInputValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return DATE_VALUE_PATTERN.test(trimmed);
}

export function getTripHistoryDetailHref(tripId: string, dateValue: string) {
  return `/trips/${encodeURIComponent(tripId)}?historyDate=${encodeURIComponent(
    dateValue
  )}`;
}

export function getTripDetailHistoryHref(historyDate?: string | null) {
  const trimmed = historyDate?.trim() ?? "";

  if (!isDateInputValue(trimmed)) {
    return "/history";
  }

  return `/history?date=${encodeURIComponent(trimmed)}`;
}
