export function hasGoogle(): boolean {
  return Boolean(process.env["GOOGLE_MAPS_API_KEY"]);
}

export function hasMapillary(): boolean {
  return Boolean(process.env["MAPILLARY_ACCESS_TOKEN"]);
}

export function hasMovebank(): boolean {
  return Boolean(
    process.env["MOVEBANK_USERNAME"] && process.env["MOVEBANK_PASSWORD"],
  );
}

export function isDemoMode(): boolean {
  return !hasGoogle() && !hasMapillary() && !hasMovebank();
}
