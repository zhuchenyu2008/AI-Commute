export type TravelTransportMode = "driving" | "transit" | "mixed";

export type TravelAttractionCategory = "natural" | "cultural";

export type TravelPlanWeather = {
  city: string;
  summary: string;
  advice: string;
  source?: string;
};

export type TravelTransportOption = {
  summary: string;
  reason: string;
  durationMinutes?: number;
  route?: string;
};

export type TravelTransport = {
  recommended: TravelTransportMode;
  reason: string;
  driving: TravelTransportOption;
  transit: TravelTransportOption;
  localMovement?: string;
};

export type TravelAttraction = {
  name: string;
  category: TravelAttractionCategory;
  reason: string;
  address?: string;
  lngLat?: string;
  day?: number;
  stayMinutes?: number;
  bestTime?: string;
  weatherNote?: string;
  notes?: string;
};

export type TravelLodging = {
  name: string;
  area: string;
  reason: string;
  budget?: string;
  notes?: string;
};

export type TravelFood = {
  name: string;
  area?: string;
  mustTry: string;
  reason: string;
  budget?: string;
  notes?: string;
};

export type TravelPitfall = {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
};

export type TravelPlan = {
  destination: string;
  summary: string;
  days?: number;
  weather: TravelPlanWeather;
  transport: TravelTransport;
  attractions: TravelAttraction[];
  lodging: TravelLodging[];
  food: TravelFood[];
  pitfalls: TravelPitfall[];
};

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function readText(
  record: Record<string, unknown>,
  key: string,
  label: string,
  required = true
) {
  const value = record[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (!required) {
    return undefined;
  }

  throw new Error(`${label}.${key} must be a non-empty string.`);
}

function readOptionalNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : undefined;
}

function readArray(record: Record<string, unknown>, key: string, label: string) {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} must be an array.`);
  }

  return value;
}

function normalizeAttraction(value: unknown): TravelAttraction {
  const record = readRecord(value, "travelPlan.attractions[]");
  const category = readText(record, "category", "travelPlan.attractions[]");
  const normalizedCategory: TravelAttractionCategory =
    category === "natural" || category === "nature" ? "natural" : "cultural";

  return {
    name: readText(record, "name", "travelPlan.attractions[]")!,
    category: normalizedCategory,
    reason: readText(record, "reason", "travelPlan.attractions[]")!,
    address: readText(record, "address", "travelPlan.attractions[]", false),
    lngLat: readText(record, "lngLat", "travelPlan.attractions[]", false),
    day: readOptionalNumber(record, "day"),
    stayMinutes: readOptionalNumber(record, "stayMinutes"),
    bestTime: readText(record, "bestTime", "travelPlan.attractions[]", false),
    weatherNote: readText(
      record,
      "weatherNote",
      "travelPlan.attractions[]",
      false
    ),
    notes: readText(record, "notes", "travelPlan.attractions[]", false),
  };
}

function normalizeTransportOption(
  value: unknown,
  label: "driving" | "transit"
): TravelTransportOption {
  const record = readRecord(value, `travelPlan.transport.${label}`);

  return {
    summary: readText(record, "summary", `travelPlan.transport.${label}`)!,
    reason: readText(record, "reason", `travelPlan.transport.${label}`)!,
    durationMinutes: readOptionalNumber(record, "durationMinutes"),
    route: readText(record, "route", `travelPlan.transport.${label}`, false),
  };
}

function normalizeLodging(value: unknown): TravelLodging {
  const record = readRecord(value, "travelPlan.lodging[]");

  return {
    name: readText(record, "name", "travelPlan.lodging[]")!,
    area: readText(record, "area", "travelPlan.lodging[]")!,
    reason: readText(record, "reason", "travelPlan.lodging[]")!,
    budget: readText(record, "budget", "travelPlan.lodging[]", false),
    notes: readText(record, "notes", "travelPlan.lodging[]", false),
  };
}

function normalizeFood(value: unknown): TravelFood {
  const record = readRecord(value, "travelPlan.food[]");

  return {
    name: readText(record, "name", "travelPlan.food[]")!,
    area: readText(record, "area", "travelPlan.food[]", false),
    mustTry: readText(record, "mustTry", "travelPlan.food[]")!,
    reason: readText(record, "reason", "travelPlan.food[]")!,
    budget: readText(record, "budget", "travelPlan.food[]", false),
    notes: readText(record, "notes", "travelPlan.food[]", false),
  };
}

function normalizePitfall(value: unknown): TravelPitfall {
  const record = readRecord(value, "travelPlan.pitfalls[]");
  const severity = readText(record, "severity", "travelPlan.pitfalls[]", false);

  return {
    title: readText(record, "title", "travelPlan.pitfalls[]")!,
    detail: readText(record, "detail", "travelPlan.pitfalls[]")!,
    severity:
      severity === "high" || severity === "low" ? severity : "medium",
  };
}

export function normalizeTravelPlan(value: unknown): TravelPlan {
  const record = readRecord(value, "travelPlan");
  const weather = readRecord(record.weather, "travelPlan.weather");
  const transport = readRecord(record.transport, "travelPlan.transport");
  const recommended = readText(
    transport,
    "recommended",
    "travelPlan.transport"
  );

  return {
    destination: readText(record, "destination", "travelPlan")!,
    summary: readText(record, "summary", "travelPlan")!,
    days: readOptionalNumber(record, "days"),
    weather: {
      city: readText(weather, "city", "travelPlan.weather")!,
      summary: readText(weather, "summary", "travelPlan.weather")!,
      advice: readText(weather, "advice", "travelPlan.weather")!,
      source: readText(weather, "source", "travelPlan.weather", false),
    },
    transport: {
      recommended:
        recommended === "driving" || recommended === "transit"
          ? recommended
          : "mixed",
      reason: readText(transport, "reason", "travelPlan.transport")!,
      driving: normalizeTransportOption(transport.driving, "driving"),
      transit: normalizeTransportOption(transport.transit, "transit"),
      localMovement: readText(
        transport,
        "localMovement",
        "travelPlan.transport",
        false
      ),
    },
    attractions: readArray(record, "attractions", "travelPlan").map(
      normalizeAttraction
    ),
    lodging: readArray(record, "lodging", "travelPlan").map(normalizeLodging),
    food: readArray(record, "food", "travelPlan").map(normalizeFood),
    pitfalls: readArray(record, "pitfalls", "travelPlan").map(normalizePitfall),
  };
}

export function parseTravelPlanJson(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return normalizeTravelPlan(JSON.parse(value));
  } catch {
    return null;
  }
}
