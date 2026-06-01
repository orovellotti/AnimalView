import { logger } from "./logger";

export type PresenceCategory =
  | "road"
  | "trail"
  | "aerialway"
  | "tourism"
  | "amenity"
  | "building"
  | "settlement"
  | "leisure";

export interface PresenceFeature {
  category: PresenceCategory;
  // Relative potential human-presence intensity, 0..1.
  weight: number;
  name?: string;
  lat: number;
  lon: number;
}

interface CacheEntry {
  at: number;
  features: PresenceFeature[];
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;
const FAILURE_TTL_MS = 45 * 1000;
// The FR mirror is the most reliable from this environment: overpass-api.de
// frequently refuses connections (ECONNREFUSED) and kumi.systems is too slow
// for the trail query. Order = preference; we fall through on failure.
const OVERPASS_ENDPOINTS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Relative human-presence intensity per category. Roads and settlements imply
// the heaviest, most constant presence; recreational trails the lightest.
const CATEGORY_WEIGHT: Record<PresenceCategory, number> = {
  road: 1,
  settlement: 1,
  tourism: 0.85,
  amenity: 0.8,
  aerialway: 0.75,
  building: 0.6,
  leisure: 0.55,
  trail: 0.45,
};

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

function classify(tags: Record<string, string>): PresenceCategory | null {
  if (tags["place"]) {
    if (/^(city|town|village|hamlet|isolated_dwelling)$/.test(tags["place"]))
      return "settlement";
  }
  if (tags["aerialway"]) return "aerialway";
  if (tags["tourism"]) return "tourism";
  if (tags["amenity"]) return "amenity";
  if (tags["leisure"]) return "leisure";
  if (tags["highway"]) {
    if (/^(path|track|footway|bridleway|steps|cycleway)$/.test(tags["highway"]))
      return "trail";
    return "road";
  }
  if (tags["building"]) return "building";
  return null;
}

/**
 * Fetch OSM features that indicate *potential* human presence around a point:
 * roads, recreational trails, ski lifts (aerialway), alpine huts & other
 * tourism POIs, parking/amenities and settlements. Each feature is tagged with
 * a relative weight so the client can render a presence heatmap.
 *
 * This is intentionally separate from {@link fetchBarriersNear}: barriers model
 * movement obstacles for the simulator, whereas presence models where humans
 * are likely to be — a path or an alpine hut adds presence but is not a barrier.
 */
export async function fetchHumanPresenceNear(
  lat: number,
  lon: number,
  radiusM: number,
): Promise<PresenceFeature[]> {
  const key = cacheKey(lat, lon, radiusM);
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.features;

  const [s, w, n, e] = bboxAround(lat, lon, radiusM);
  const bbox = `${s},${w},${n},${e}`;

  // We deliberately run TWO queries concurrently instead of one big union:
  //  - "sparse": settlements, roads, tourism, amenities, lifts, leisure. These
  //    tags are uncommon, so this resolves quickly even over a large box.
  //  - "trails": recreational paths/tracks. In alpine terrain these are extremely
  //    dense and a single combined query routinely exceeds 30s and aborts.
  // Splitting lets the heatmap render from whatever returns: if trails are slow
  // or fail, the sparse layer still shows. A bare way["building"] scan is omitted
  // entirely — it dominates query time and is redundant for a presence signal.
  const sparseQuery = `
[out:json][timeout:25];
(
  node["place"~"city|town|village|hamlet|isolated_dwelling"](${bbox});
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|service"](${bbox});
  nwr["tourism"~"alpine_hut|wilderness_hut|chalet|camp_site|caravan_site|picnic_site|viewpoint|attraction|hotel|hostel|guest_house"](${bbox});
  nwr["amenity"~"parking|restaurant|cafe|bar|fast_food|shelter|toilets"](${bbox});
  way["aerialway"](${bbox});
  node["aerialway"="station"](${bbox});
  nwr["leisure"~"pitch|park|sports_centre|playground|track"](${bbox});
);
out center 600;`;
  const trailQuery = `
[out:json][timeout:25];
(
  way["highway"~"path|track|footway|bridleway|steps|cycleway"](${bbox});
);
out center 500;`;

  const [sparseEls, trailEls] = await Promise.all([
    runOverpass(sparseQuery, 22000),
    runOverpass(trailQuery, 28000),
  ]);

  // Both endpoints failed for both queries — cache empty briefly and retry soon.
  if (sparseEls === null && trailEls === null) {
    CACHE.set(key, { at: Date.now() - (TTL_MS - FAILURE_TTL_MS), features: [] });
    return [];
  }

  const features: PresenceFeature[] = [];
  for (const el of [...(sparseEls ?? []), ...(trailEls ?? [])]) {
    const center = el.center || (el.lat && el.lon ? el : null);
    if (!center) continue;
    const tags = (el.tags || {}) as Record<string, string>;
    const category = classify(tags);
    if (!category) continue;
    const feature: PresenceFeature = {
      category,
      weight: CATEGORY_WEIGHT[category],
      lat: center.lat,
      lon: center.lon,
    };
    if (typeof tags["name"] === "string" && tags["name"].length > 0)
      feature.name = tags["name"];
    features.push(feature);
  }

  // If only one query succeeded the result is degraded (e.g. trails missing).
  // Cache it briefly so the heatmap still renders now, but recovers soon once
  // the failing mirror is healthy again, instead of freezing for 30 minutes.
  const partial = sparseEls === null || trailEls === null;
  const at = partial ? Date.now() - (TTL_MS - FAILURE_TTL_MS) : Date.now();
  CACHE.set(key, { at, features });
  return features;
}

// Run one Overpass query, trying each endpoint in turn. Returns the element
// array on success, or null when every endpoint failed/aborted.
async function runOverpass(
  query: string,
  abortMs: number,
): Promise<any[] | null> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), abortMs);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "AnimalView/1.0 (wildlife tracking; Bear71-inspired)",
        },
        body: "data=" + encodeURIComponent(query),
        signal: ctrl.signal,
      });
      if (!r.ok) continue;
      const data = (await r.json()) as { elements?: any[] };
      return data.elements ?? [];
    } catch (err) {
      logger.warn({ err, endpoint }, "overpass presence query failed, trying next");
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
