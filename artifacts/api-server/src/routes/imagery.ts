import { Router, type IRouter } from "express";
import {
  MatchImageryBody,
  MatchImageryResponse,
  GetProvidersResponse,
  AnalyzeImageryBody,
} from "@workspace/api-zod";
import { ai } from "@workspace/integrations-gemini-ai";
import {
  haversineMeters,
  bearingDegrees,
  confidenceForDistance,
  downsampleByDistance,
  distanceToTrackMeters,
} from "../lib/geo";
import {
  hasGoogle,
  hasMapillary,
  hasMovebank,
} from "../lib/providers";

const router: IRouter = Router();

type TrackPoint = { lat: number; lon: number; timestamp: string };

type Match = {
  trackPointIndex: number;
  provider: string;
  distanceM: number;
  panoId?: string;
  imageId?: string;
  imageLat?: number;
  imageLon?: number;
  imageDate?: string;
  heading?: number;
  confidence: string;
  previewUrl?: string;
};

const metadataCache = new Map<string, unknown>();

async function googleMetadata(
  lat: number,
  lon: number,
  radius: number,
): Promise<{
  pano_id?: string;
  location?: { lat: number; lng: number };
  date?: string;
} | null> {
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  if (!key) return null;
  const cacheKey = `g:${lat.toFixed(4)}:${lon.toFixed(4)}:${radius}`;
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey) as never;
  }
  // Use the default source (NOT source=outdoor): in remote mountain terrain the
  // only Google coverage is user-contributed Photo Spheres people shoot on
  // trails and peaks, and those are returned by the default source but excluded
  // by source=outdoor (which only covers official Street View collections).
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lon}&radius=${radius}&key=${key}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = (await r.json()) as {
    status: string;
    pano_id?: string;
    location?: { lat: number; lng: number };
    date?: string;
  };
  if (j.status !== "OK") {
    metadataCache.set(cacheKey, null);
    return null;
  }
  metadataCache.set(cacheKey, j);
  return j;
}

async function mapillaryNearby(
  lat: number,
  lon: number,
  radius: number,
): Promise<{
  id: string;
  lat: number;
  lon: number;
  date?: string;
  thumbUrl?: string;
} | null> {
  // A Mapillary v4 client token has the canonical shape `MLY|<appId>|<32 hex>`.
  // Extract that pattern from the env value so stray characters introduced by a
  // copy/paste (e.g. a trailing digit or surrounding whitespace) don't cause
  // "Error verifying the token". Fall back to the trimmed raw value otherwise.
  const rawToken = process.env["MAPILLARY_ACCESS_TOKEN"];
  const token =
    rawToken?.match(/MLY\|\d+\|[0-9a-f]{32}/i)?.[0] ?? rawToken?.trim();
  if (!token) return null;
  const cacheKey = `m:${lat.toFixed(4)}:${lon.toFixed(4)}:${radius}`;
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey) as never;
  }
  // ~1e-5 deg ≈ 1.11m. Build a small bbox around the point.
  let dLat = radius / 111000;
  let dLon = radius / (111000 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  // Mapillary rejects bboxes larger than 0.010 sq deg with a 500. If the
  // requested radius would exceed that, shrink the box (preserving aspect ratio)
  // so the request still succeeds for a tighter search area.
  const MAX_BBOX_AREA = 0.0099;
  const bboxArea = 2 * dLat * (2 * dLon);
  if (bboxArea > MAX_BBOX_AREA) {
    const scale = Math.sqrt(MAX_BBOX_AREA / bboxArea);
    dLat *= scale;
    dLon *= scale;
  }
  const bbox = `${lon - dLon},${lat - dLat},${lon + dLon},${lat + dLat}`;
  const url = `https://graph.mapillary.com/images?access_token=${token}&fields=id,computed_geometry,captured_at,thumb_1024_url&bbox=${bbox}&limit=1`;
  const r = await fetch(url);
  if (!r.ok) {
    metadataCache.set(cacheKey, null);
    return null;
  }
  const j = (await r.json()) as {
    data?: {
      id: string;
      computed_geometry?: { coordinates: [number, number] };
      captured_at?: number;
      thumb_1024_url?: string;
    }[];
  };
  const first = j.data?.[0];
  if (!first?.computed_geometry) {
    metadataCache.set(cacheKey, null);
    return null;
  }
  const [mlon, mlat] = first.computed_geometry.coordinates;
  const result = {
    id: first.id,
    lat: mlat,
    lon: mlon,
    date: first.captured_at ? new Date(first.captured_at).toISOString() : undefined,
    thumbUrl: first.thumb_1024_url,
  };
  metadataCache.set(cacheKey, result);
  return result;
}

async function wikimediaNearby(
  lat: number,
  lon: number,
  radius: number,
): Promise<{
  id: string;
  lat: number;
  lon: number;
  title: string;
  thumbUrl: string;
  descriptionUrl: string;
} | null> {
  const cacheKey = `w:${lat.toFixed(4)}:${lon.toFixed(4)}:${radius}`;
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey) as never;
  }
  // gsradius capped at 10000m by Wikimedia; widen narrow search radii.
  const r = Math.min(10000, Math.max(radius, 5000));
  // Fetch several nearby candidates so a single result missing a thumbnail or
  // coordinates doesn't make the whole point yield nothing.
  const url =
    `https://commons.wikimedia.org/w/api.php?` +
    `action=query&format=json&origin=*` +
    `&generator=geosearch&ggsnamespace=6&ggslimit=20` +
    `&ggsradius=${r}&ggscoord=${lat}%7C${lon}` +
    `&prop=imageinfo|coordinates&iiprop=url|extmetadata&iiurlwidth=640`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "AnimalView/1.0 (open-source bird/wolf tracker)" },
  });
  if (!resp.ok) {
    metadataCache.set(cacheKey, null);
    return null;
  }
  const j = (await resp.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          pageid: number;
          title: string;
          coordinates?: { lat: number; lon: number }[];
          imageinfo?: {
            thumburl?: string;
            descriptionurl?: string;
            extmetadata?: { DateTimeOriginal?: { value?: string } };
          }[];
        }
      >;
    };
  };
  const pages = j.query?.pages;
  if (!pages) {
    metadataCache.set(cacheKey, null);
    return null;
  }
  // Keep only candidates that actually have a thumbnail and coordinates, then
  // pick the one geographically closest to the track point.
  let best: {
    id: string;
    lat: number;
    lon: number;
    title: string;
    thumbUrl: string;
    descriptionUrl: string;
    dist: number;
  } | null = null;
  for (const page of Object.values(pages)) {
    const info = page?.imageinfo?.[0];
    const coord = page?.coordinates?.[0];
    if (!info?.thumburl || !coord) continue;
    const dist = haversineMeters({ lat, lon }, { lat: coord.lat, lon: coord.lon });
    if (!best || dist < best.dist) {
      best = {
        id: String(page.pageid),
        lat: coord.lat,
        lon: coord.lon,
        title: page.title,
        thumbUrl: info.thumburl,
        descriptionUrl: info.descriptionurl ?? "",
        dist,
      };
    }
  }
  if (!best) {
    metadataCache.set(cacheKey, null);
    return null;
  }
  const { dist: _dist, ...result } = best;
  metadataCache.set(cacheKey, result);
  return result;
}

// GBIF (Global Biodiversity Information Facility) is an open, key-less API of
// real, verified species occurrence records — many with photographs taken by
// naturalists at the observation site. Unlike Street View / Mapillary (which
// show terrain), these are genuine photos of the species and its surroundings
// near the animal's recorded path. Resolve the scientific name to a GBIF
// taxonKey once, then query occurrences carrying a StillImage near each point.
const gbifTaxonCache = new Map<string, number | null>();
async function gbifTaxonKey(scientificName: string): Promise<number | null> {
  const name = scientificName.trim();
  if (!name) return null;
  if (gbifTaxonCache.has(name)) return gbifTaxonCache.get(name) ?? null;
  try {
    const r = await fetch(
      `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}`,
      { headers: { "User-Agent": "AnimalView/1.0 (wildlife tracker)" } },
    );
    // Only cache a definitive answer from a successful response. A transient
    // network error or non-2xx must NOT be cached, otherwise one hiccup would
    // suppress GBIF for that species until the process restarts.
    if (!r.ok) return null;
    const j = (await r.json()) as { usageKey?: number; speciesKey?: number };
    const key = j.usageKey ?? j.speciesKey ?? null;
    gbifTaxonCache.set(name, key);
    return key;
  } catch {
    return null;
  }
}

// iNaturalist (the dominant GBIF media host) serves multi-megabyte "original"
// images. The candidate panel mounts every match as an <img> (large preview +
// thumbnail grid), so loading dozens of originals exhausts the browser tab's
// memory and crashes it. Request the ~500px "medium" variant instead (~100 KB).
// Hosts whose resize scheme we don't know are left untouched.
function gbifPreviewUrl(identifier: string): string {
  try {
    const u = new URL(identifier);
    const isINaturalist =
      u.hostname === "inaturalist-open-data.s3.amazonaws.com" ||
      u.hostname === "static.inaturalist.org" ||
      u.hostname.endsWith(".inaturalist.org");
    if (isINaturalist) {
      // Rewrite the "original" path segment to "medium" via the parsed pathname
      // (case-insensitive, extension-agnostic) so query string and hash are
      // preserved and uncommon URL shapes are still downsized.
      u.pathname = u.pathname.replace(
        /\/original(\.\w+)?$/i,
        (_m, ext: string | undefined) => `/medium${ext ?? ""}`,
      );
      return u.toString();
    }
  } catch {
    // not a parseable URL — fall through and return as-is
  }
  return identifier;
}

async function gbifNearby(
  lat: number,
  lon: number,
  radius: number,
  taxonKey: number,
): Promise<{ id: string; lat: number; lon: number; date?: string; thumbUrl: string }[]> {
  const cacheKey = `gbif:${taxonKey}:${lat.toFixed(3)}:${lon.toFixed(3)}:${radius}`;
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey) as never;
  }
  const url =
    `https://api.gbif.org/v1/occurrence/search?mediaType=StillImage` +
    `&taxonKey=${taxonKey}&geoDistance=${lat},${lon},${Math.round(radius)}m&limit=20`;
  const r = await fetch(url, {
    headers: { "User-Agent": "AnimalView/1.0 (wildlife tracker)" },
  });
  if (!r.ok) {
    metadataCache.set(cacheKey, []);
    return [];
  }
  const j = (await r.json()) as {
    results?: {
      key?: number;
      gbifID?: string;
      decimalLatitude?: number;
      decimalLongitude?: number;
      eventDate?: string;
      media?: { type?: string; identifier?: string }[];
    }[];
  };
  const out: { id: string; lat: number; lon: number; date?: string; thumbUrl: string }[] = [];
  for (const o of j.results ?? []) {
    if (o.decimalLatitude == null || o.decimalLongitude == null) continue;
    const media = (o.media ?? []).find(
      (m) => (m.type === "StillImage" || !m.type) && m.identifier,
    );
    if (!media?.identifier) continue;
    out.push({
      id: String(o.key ?? o.gbifID ?? media.identifier),
      lat: o.decimalLatitude,
      lon: o.decimalLongitude,
      date: o.eventDate,
      thumbUrl: gbifPreviewUrl(media.identifier),
    });
  }
  metadataCache.set(cacheKey, out);
  return out;
}

router.get("/providers", (_req, res) => {
  const data = GetProvidersResponse.parse({
    google: hasGoogle(),
    mapillary: hasMapillary(),
    movebank: hasMovebank(),
  });
  res.json(data);
});

router.post("/match-imagery", async (req, res) => {
  const parsed = MatchImageryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request body" });
    return;
  }
  const { points, providers, scientificName } = parsed.data;
  // Clamp to the UI's Search Radius range (500–10000m). Because the match
  // threshold now follows radius, an unbounded value would pull in weakly
  // relevant photos far from the track, so enforce the contract server-side.
  const radius = Math.min(10000, Math.max(500, parsed.data.radius));
  // Sample the track at a fixed spacing INDEPENDENT of the search radius.
  // Tying spacing to radius (e.g. radius*2) is counterproductive: a large
  // radius collapses the whole track to a single query point and returns FEWER
  // photos. A fixed ~250 m spacing probes many distinct spots along the path,
  // so more unique panoramas/photos surface; the radius only controls how far
  // off-track a returned photo may sit.
  const SAMPLE_SPACING_M = 250;
  // Hard cap on query points so outbound API fanout (sampleCount × providers)
  // stays bounded regardless of track length/density — guards third-party
  // quota/cost and request latency. Animals meander, so a track's cumulative
  // path can be hundreds of km (the ibex track is ~255 km → ~1000 samples at
  // 250 m); the cap keeps fanout sane while still spreading probes across the
  // whole path to capture nearly all distinct nearby panoramas.
  const MAX_QUERY_POINTS = 200;
  let sampled = downsampleByDistance(points as TrackPoint[], SAMPLE_SPACING_M);
  if (sampled.length > MAX_QUERY_POINTS) {
    // Deterministic stride thinning guarantees the cap holds even when the
    // input is already sparser than SAMPLE_SPACING_M (where re-downsampling by
    // distance cannot remove points). Keep every Nth sample plus the last one.
    const step = Math.ceil(sampled.length / MAX_QUERY_POINTS);
    const thinned = sampled.filter((_, i) => i % step === 0);
    const last = sampled[sampled.length - 1]!;
    if (thinned[thinned.length - 1] !== last) thinned.push(last);
    sampled = thinned;
  }
  const wantGoogle = providers.includes("google") && hasGoogle();
  const wantMapillary = providers.includes("mapillary") && hasMapillary();
  // Wikimedia is always available (no API key needed); include it whenever
  // requested OR as a fallback when no other real provider is configured.
  const wantWikimedia =
    providers.includes("wikimedia") || (!wantGoogle && !wantMapillary);
  const wantGbif = providers.includes("gbif") && !!scientificName?.trim();

  // Probe one sampled point across every requested provider.
  const probe = async (s: {
    point: TrackPoint;
    originalIndex: number;
  }): Promise<Match[]> => {
    const { point, originalIndex } = s;
    const next = points[originalIndex + 1] ?? point;
    const heading = bearingDegrees(point, next);
    const out: Match[] = [];
    if (wantGoogle) {
      try {
        const g = await googleMetadata(point.lat, point.lon, radius);
        if (g?.pano_id && g.location) {
          const distanceM = haversineMeters(point, {
            lat: g.location.lat,
            lon: g.location.lng,
          });
          out.push({
            trackPointIndex: originalIndex,
            provider: "google",
            distanceM,
            panoId: g.pano_id,
            imageLat: g.location.lat,
            imageLon: g.location.lng,
            imageDate: g.date,
            heading,
            confidence: confidenceForDistance(distanceM),
            previewUrl: `/api/streetview-image?pano_id=${encodeURIComponent(g.pano_id)}&heading=${Math.round(heading)}`,
          });
        }
      } catch (err) {
        req.log.warn({ err }, "google metadata failed");
      }
    }
    if (wantMapillary) {
      try {
        const m = await mapillaryNearby(point.lat, point.lon, radius);
        if (m) {
          const distanceM = haversineMeters(point, { lat: m.lat, lon: m.lon });
          out.push({
            trackPointIndex: originalIndex,
            provider: "mapillary",
            distanceM,
            imageId: m.id,
            imageLat: m.lat,
            imageLon: m.lon,
            imageDate: m.date,
            heading,
            confidence: confidenceForDistance(distanceM),
            previewUrl: m.thumbUrl,
          });
        }
      } catch (err) {
        req.log.warn({ err }, "mapillary fetch failed");
      }
    }
    if (wantWikimedia) {
      try {
        const w = await wikimediaNearby(point.lat, point.lon, radius);
        if (w) {
          const distanceM = haversineMeters(point, { lat: w.lat, lon: w.lon });
          out.push({
            trackPointIndex: originalIndex,
            provider: "wikimedia",
            distanceM,
            imageId: w.id,
            imageLat: w.lat,
            imageLon: w.lon,
            heading,
            confidence: confidenceForDistance(distanceM),
            previewUrl: w.thumbUrl,
          });
        }
      } catch (err) {
        req.log.warn({ err }, "wikimedia fetch failed");
      }
    }
    return out;
  };

  // Run probes with bounded concurrency so long tracks don't serialize into
  // dozens of sequential round-trips (architect-flagged latency).
  const CONCURRENCY = 6;
  const matches: Match[] = [];
  for (let i = 0; i < sampled.length; i += CONCURRENCY) {
    const batch = sampled.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((s) => probe(s!)));
    for (const r of results) matches.push(...r);
  }

  // GBIF occurrence media: a single resolved taxonKey, then a query per sampled
  // point. GBIF returns many occurrences per point, so sample more coarsely than
  // the street-imagery probes to keep outbound fanout bounded while still
  // spreading photo searches along the whole path.
  if (wantGbif && scientificName) {
    const taxonKey = await gbifTaxonKey(scientificName);
    if (taxonKey != null) {
      const GBIF_MAX_POINTS = 30;
      let gbifSamples = sampled;
      if (gbifSamples.length > GBIF_MAX_POINTS) {
        const step = Math.ceil(gbifSamples.length / GBIF_MAX_POINTS);
        gbifSamples = gbifSamples.filter((_, i) => i % step === 0);
      }
      for (let i = 0; i < gbifSamples.length; i += CONCURRENCY) {
        const batch = gbifSamples.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (s) => {
            try {
              return await gbifNearby(s!.point.lat, s!.point.lon, radius, taxonKey);
            } catch (err) {
              req.log.warn({ err }, "gbif fetch failed");
              return [];
            }
          }),
        );
        for (let b = 0; b < results.length; b++) {
          const s = batch[b]!;
          for (const g of results[b]!) {
            const distanceM = haversineMeters(s.point, { lat: g.lat, lon: g.lon });
            matches.push({
              trackPointIndex: s.originalIndex,
              provider: "gbif",
              distanceM,
              imageId: g.id,
              imageLat: g.lat,
              imageLon: g.lon,
              imageDate: g.date,
              confidence: confidenceForDistance(distanceM),
              previewUrl: g.thumbUrl,
            });
          }
        }
      }
    }
  }
  // Keep photos near the track: measure the true distance from each photo's
  // location to the track polyline (not just to the sampled query point) and
  // drop anything farther than the threshold. The threshold follows the user's
  // search radius (with a small floor) so sparse, real, user-contributed
  // mountain photos — which sit hundreds of metres off the GPS path — actually
  // surface instead of being cut by a fixed 50 m gate. Recompute
  // distance/confidence from this true distance.
  const INTERSECTION_THRESHOLD_M = Math.max(50, radius);
  const track = points as TrackPoint[];
  const intersecting = matches.filter((m) => {
    if (m.imageLat == null || m.imageLon == null) return false;
    const d = distanceToTrackMeters(
      { lat: m.imageLat, lon: m.imageLon },
      track,
    );
    if (d > INTERSECTION_THRESHOLD_M) return false;
    m.distanceM = d;
    m.confidence = confidenceForDistance(d);
    return true;
  });
  // The same panorama/photo is often the nearest to several adjacent sample
  // points; collapse those duplicates, keeping the closest instance of each.
  const deduped = new Map<string, Match>();
  for (const m of intersecting) {
    const key = `${m.provider}:${m.panoId ?? m.imageId}`;
    const prev = deduped.get(key);
    if (!prev || m.distanceM < prev.distanceM) deduped.set(key, m);
  }
  const data = MatchImageryResponse.parse({
    mode: "real",
    matches: [...deduped.values()],
  });
  res.json(data);
});

router.get("/streetview-image", async (req, res) => {
  const { pano_id, heading } = req.query as Record<string, string>;
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  if (!key || !pano_id) {
    res.status(404).json({ error: "no imagery" });
    return;
  }
  const url = `https://maps.googleapis.com/maps/api/streetview?size=640x360&pano=${encodeURIComponent(
    pano_id,
  )}&heading=${encodeURIComponent(heading ?? "0")}&fov=90&key=${key}`;
  // Proxy the image bytes server-side instead of redirecting the browser to
  // Google. This keeps the API key off the client and avoids browser-referrer
  // based key restrictions that can block the image in production.
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      req.log.warn(
        { status: upstream.status },
        "streetview upstream fetch failed",
      );
      res.status(502).json({ error: "streetview unavailable" });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") ?? "image/jpeg",
    );
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch (err) {
    req.log.error({ err }, "streetview proxy failed");
    res.status(502).json({ error: "streetview unavailable" });
  }
});

// Hosts we allow the server to fetch context images from. Prevents the
// analyze route from being used as an open SSRF proxy to arbitrary URLs.
const ALLOWED_IMAGE_HOSTS = [
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "maps.googleapis.com",
  "inaturalist-open-data.s3.amazonaws.com",
];
function isAllowedImageHost(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOSTS.some(
      (h) =>
        u.hostname === h ||
        u.hostname.endsWith(".mapillary.com") ||
        u.hostname.endsWith(".inaturalist.org"),
    );
  } catch {
    return false;
  }
}

const narrativeCache = new Map<string, string>();

router.post("/analyze-imagery", async (req, res) => {
  const parsed = AnalyzeImageryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request body" });
    return;
  }
  const { species, scientificName, habitat, provider, panoId, heading, imageUrl, distanceM } =
    parsed.data;

  // Resolve the image source. For Google we build the (key-bearing) Street View
  // URL server-side; for other providers we accept a preview URL but only from
  // an allowlisted host.
  let fetchUrl: string | null = null;
  if (provider === "google" && panoId) {
    const key = process.env["GOOGLE_MAPS_API_KEY"];
    if (key) {
      fetchUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x360&pano=${encodeURIComponent(
        panoId,
      )}&heading=${encodeURIComponent(String(Math.round(heading ?? 0)))}&fov=90&key=${key}`;
    }
  } else if (imageUrl && isAllowedImageHost(imageUrl)) {
    fetchUrl = imageUrl;
  }
  if (!fetchUrl) {
    res.status(400).json({ error: "no analyzable image for this match" });
    return;
  }

  const cacheKey = [
    species,
    scientificName ?? "",
    habitat ?? "",
    provider,
    panoId ?? imageUrl,
    Math.round(heading ?? 0),
    distanceM != null ? Math.round(distanceM) : "",
  ].join("|");
  const cached = narrativeCache.get(cacheKey);
  if (cached) {
    res.json({ narrative: cached, species });
    return;
  }

  try {
    const imgRes = await fetch(fetchUrl, { redirect: "error" });
    if (!imgRes.ok) {
      req.log.warn({ status: imgRes.status }, "analyze image fetch failed");
      res.status(502).json({ error: "could not load image" });
      return;
    }
    const mimeType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const base64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");

    const sci = scientificName ? ` (${scientificName})` : "";
    const hab = habitat ? ` Typical habitat for this species: ${habitat}.` : "";
    const dist = distanceM != null ? ` This location is about ${Math.round(distanceM)} meters from the animal's recorded GPS path.` : "";
    const prompt = `This is a photograph of terrain along the recorded movement path of a ${species}${sci}.${hab}${dist}

Describe what is actually visible in the image in plain, factual language: landforms and terrain, vegetation type and cover, water, open versus enclosed ground, and any human features such as roads, vehicles, buildings, fences, or trails. Then state, factually, how these features are relevant to the species — what they offer or constrain in terms of cover, forage, movement, or human disturbance.

Write 2 to 4 short, neutral sentences. Only describe what is present in the image; do not speculate or invent details. Avoid dramatic or first-person language and do not mention cameras, photos, or AI.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: prompt },
          ],
        },
      ],
      config: { maxOutputTokens: 8192 },
    });

    const narrative = (response.text ?? "").trim();
    if (!narrative) {
      res.status(502).json({ error: "no narrative generated" });
      return;
    }
    narrativeCache.set(cacheKey, narrative);
    res.json({ narrative, species });
  } catch (err) {
    req.log.error({ err }, "analyze-imagery failed");
    res.status(502).json({ error: "analysis unavailable" });
  }
});

export default router;
