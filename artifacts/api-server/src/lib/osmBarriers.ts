import { logger } from "./logger";

export interface BarrierFeature {
  kind: "highway" | "water" | "urban";
  lat: number;
  lon: number;
}

interface CacheEntry {
  at: number;
  features: BarrierFeature[];
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function cacheKey(lat: number, lon: number, radiusM: number): string {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}_${radiusM}`;
}

function bboxAround(
  lat: number,
  lon: number,
  radiusM: number,
): [number, number, number, number] {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}

export async function fetchBarriersNear(
  lat: number,
  lon: number,
  radiusM: number,
): Promise<BarrierFeature[]> {
  const key = cacheKey(lat, lon, radiusM);
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.features;

  const [s, w, n, e] = bboxAround(lat, lon, radiusM);
  const bbox = `${s},${w},${n},${e}`;
  const query = `
[out:json][timeout:15];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary"](${bbox});
  way["waterway"~"river|canal"](${bbox});
  way["natural"="water"](${bbox});
  way["landuse"~"residential|industrial|commercial"](${bbox});
);
out center 400;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 18000);
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) continue;
      const data = (await r.json()) as { elements?: any[] };
      const features: BarrierFeature[] = [];
      for (const el of data.elements || []) {
        const center = el.center || (el.lat && el.lon ? el : null);
        if (!center) continue;
        const tags = el.tags || {};
        let kind: BarrierFeature["kind"] | null = null;
        if (tags.highway) kind = "highway";
        else if (tags.waterway || tags.natural === "water") kind = "water";
        else if (tags.landuse) kind = "urban";
        if (!kind) continue;
        features.push({ kind, lat: center.lat, lon: center.lon });
      }
      CACHE.set(key, { at: Date.now(), features });
      return features;
    } catch (err) {
      logger.warn({ err, endpoint }, "overpass query failed, trying next");
    }
  }
  CACHE.set(key, { at: Date.now(), features: [] });
  return [];
}
