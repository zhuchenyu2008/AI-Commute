export type AmapLinkInput = {
  destinationName: string;
  destinationAddress?: string | null;
  destinationLngLat?: string | null;
};

function normalizeLngLat(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || !/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return null;
  }

  return trimmed.replace(/\s+/g, "");
}

export function buildAmapLink(input: AmapLinkInput) {
  const position = normalizeLngLat(input.destinationLngLat);
  const name = input.destinationName.trim();

  if (position) {
    const params = new URLSearchParams({
      position,
      name: name || "目的地",
      callnative: "1",
    });

    return `https://uri.amap.com/marker?${params.toString()}`;
  }

  const keyword = [name, input.destinationAddress?.trim()]
    .filter(Boolean)
    .join(" ");

  if (!keyword) return undefined;

  const params = new URLSearchParams({
    keyword,
    callnative: "1",
  });

  return `https://uri.amap.com/search?${params.toString()}`;
}
