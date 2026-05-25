export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDegrees(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function confidenceForDistance(distM: number): "high" | "medium" | "low" {
  if (distM <= 25) return "high";
  if (distM <= 100) return "medium";
  return "low";
}

export function downsampleByDistance<
  T extends { lat: number; lon: number },
>(points: T[], minMeters: number): { point: T; originalIndex: number }[] {
  if (points.length === 0) return [];
  const kept: { point: T; originalIndex: number }[] = [
    { point: points[0]!, originalIndex: 0 },
  ];
  let last = points[0]!;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    if (haversineMeters(last, p) >= minMeters) {
      kept.push({ point: p, originalIndex: i });
      last = p;
    }
  }
  return kept;
}
