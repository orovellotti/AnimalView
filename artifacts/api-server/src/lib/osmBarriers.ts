import { logger } from "./logger";

export interface BarrierFeature {
  kind: "highway" | "railway" | "water" | "urban";
  // Raw OSM tag value, e.g. "motorway", "primary", "rail", "river", "industrial".
  subtype?: string;
  // OSM name when present, e.g. "A2", "Tauernautobahn", "Drava".
  name?: string;
  lat: number;
  lon: number;
}

interface CacheEntry {
  at: number;
  features: BarrierFeature[];
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;
const FAILURE_TTL_MS = 45 * 1000;
// The FR mirror is the most reliable from this environment: overpass-api.de
// frequently refuses connections (ECONNREFUSED) and kumi.systems is often slow.
// Order = preference; we fall through to the next on failure.
const OVERPASS_ENDPOINTS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
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
  way["railway"~"rail|light_rail|narrow_gauge"](${bbox});
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
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "AnimalView/1.0 (wildlife tracking; Bear71-inspired)",
        },
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
        let subtype: string | undefined;
        if (tags.highway) {
          kind = "highway";
          subtype = tags.highway;
        } else if (tags.railway) {
          kind = "railway";
          subtype = tags.railway;
        } else if (tags.waterway || tags.natural === "water") {
          kind = "water";
          subtype = tags.waterway || (tags.natural === "water" ? "water" : undefined);
        } else if (tags.landuse) {
          kind = "urban";
          subtype = tags.landuse;
        }
        if (!kind) continue;
        const feature: BarrierFeature = { kind, lat: center.lat, lon: center.lon };
        if (subtype) feature.subtype = subtype;
        if (typeof tags.name === "string" && tags.name.length > 0) feature.name = tags.name;
        features.push(feature);
      }
      CACHE.set(key, { at: Date.now(), features });
      return features;
    } catch (err) {
      logger.warn({ err, endpoint }, "overpass query failed, trying next");
    }
  }
  // All endpoints failed — cache empty with a short TTL so we retry soon.
  CACHE.set(key, { at: Date.now() - (TTL_MS - FAILURE_TTL_MS), features: [] });
  return [];
}
