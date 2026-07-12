type MapPathStop = {
  name?: string | null;
};

export function buildMapPath(
  originName: string | null | undefined,
  stops: MapPathStop[]
) {
  return [originName, ...stops.map((stop) => stop.name)]
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name))
    .filter((name, index, path) => index === 0 || name !== path[index - 1]);
}
