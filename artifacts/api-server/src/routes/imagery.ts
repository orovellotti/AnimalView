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
  const token = process.env["MAPILLARY_ACCESS_TOKEN"];
  if (!token) return null;
  const cacheKey = `m:${lat.toFixed(4)}:${lon.toFixed(4)}:${radius}`;
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey) as never;
  }
  // ~1e-5 deg ≈ 1.11m. Build a small bbox around the point.
  const dLat = radius / 111000;
  const dLon = radius / (111000 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
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
  const { points, radius, providers } = parsed.data;
  const sampled = downsampleByDistance(
    points as TrackPoint[],
    Math.max(80, radius * 2),
  );
  const matches: Match[] = [];
  const wantGoogle = providers.includes("google") && hasGoogle();
  const wantMapillary = providers.includes("mapillary") && hasMapillary();
  // Wikimedia is always available (no API key needed); include it whenever
  // requested OR as a fallback when no other real provider is configured.
  const wantWikimedia =
    providers.includes("wikimedia") || (!wantGoogle && !wantMapillary);

  // Real mode: respect a small concurrency limit
  for (let i = 0; i < sampled.length; i++) {
    const { point, originalIndex } = sampled[i]!;
    const next = points[originalIndex + 1] ?? point;
    const heading = bearingDegrees(point, next);
    if (wantGoogle) {
      try {
        const g = await googleMetadata(point.lat, point.lon, radius);
        if (g?.pano_id && g.location) {
          const distanceM = haversineMeters(point, {
            lat: g.location.lat,
            lon: g.location.lng,
          });
          matches.push({
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
          matches.push({
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
          matches.push({
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
  }
  // Keep only photos that genuinely intersect the track: measure the true
  // distance from each photo's location to the track polyline (not just to the
  // sampled query point) and drop anything farther than the intersection
  // threshold. Also recompute distance/confidence from this true distance.
  const INTERSECTION_THRESHOLD_M = 50;
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
  const data = MatchImageryResponse.parse({ mode: "real", matches: intersecting });
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
];
function isAllowedImageHost(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOSTS.some(
      (h) => u.hostname === h || u.hostname.endsWith(".mapillary.com"),
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
    const hab = habitat ? ` Its typical habitat: ${habitat}.` : "";
    const dist = distanceM != null ? ` This place sits about ${Math.round(distanceM)} meters from the animal's recorded path.` : "";
    const prompt = `You are a wild ${species}${sci}, a real animal moving through this exact landscape.${hab}${dist}

Look closely at this photograph of the terrain. Describe this place from your own senses and instincts, in the first person ("I"). Ground every observation in what is actually visible in the image — terrain, vegetation, cover, water, open ground, roads, vehicles, buildings, or signs of humans. Read the scene as survival: where is shelter, where might prey or food be, where is danger, and what do you do next.

Write 2 to 4 short sentences, present tense, vivid but restrained. Do not invent things that are not in the image. Do not mention cameras, photos, GPS, or that you are an AI. End with the instinctive decision you make here.`;

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
