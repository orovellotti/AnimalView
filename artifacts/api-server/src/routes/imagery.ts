import { Router, type IRouter } from "express";
import {
  MatchImageryBody,
  MatchImageryResponse,
  GetProvidersResponse,
} from "@workspace/api-zod";
import {
  haversineMeters,
  bearingDegrees,
  confidenceForDistance,
  downsampleByDistance,
} from "../lib/geo";
import {
  hasGoogle,
  hasMapillary,
  hasMovebank,
  isDemoMode,
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

router.get("/providers", (_req, res) => {
  const data = GetProvidersResponse.parse({
    google: hasGoogle(),
    mapillary: hasMapillary(),
    movebank: hasMovebank(),
    demoMode: isDemoMode(),
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
  const wantGoogle = providers.includes("google");
  const wantMapillary = providers.includes("mapillary");
  const demo = isDemoMode() || (!hasGoogle() && !hasMapillary());

  if (demo) {
    // Generate deterministic demo matches every ~3rd sampled point
    for (let i = 0; i < sampled.length; i++) {
      const { point, originalIndex } = sampled[i]!;
      if (i % 3 !== 0) continue;
      const offsetLat = (((i * 37) % 50) - 25) / 111000;
      const offsetLon = (((i * 53) % 50) - 25) / 111000;
      const imageLat = point.lat + offsetLat * 1.0;
      const imageLon = point.lon + offsetLon * 1.0;
      const distanceM = haversineMeters(point, { lat: imageLat, lon: imageLon });
      const provider = i % 2 === 0 ? "google" : "mapillary";
      const next = points[originalIndex + 1] ?? point;
      const heading = bearingDegrees(point, next);
      matches.push({
        trackPointIndex: originalIndex,
        provider,
        distanceM,
        panoId: provider === "google" ? `demo-pano-${i}` : undefined,
        imageId: provider === "mapillary" ? `demo-image-${i}` : undefined,
        imageLat,
        imageLon,
        imageDate: "2023-08",
        heading,
        confidence: confidenceForDistance(distanceM),
        previewUrl: `/api/streetview-image?demo=1&i=${i}&heading=${Math.round(heading)}`,
      });
    }
    const data = MatchImageryResponse.parse({ mode: "demo", matches });
    res.json(data);
    return;
  }

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
  }
  const data = MatchImageryResponse.parse({ mode: "real", matches });
  res.json(data);
});

router.get("/streetview-image", async (req, res) => {
  const { pano_id, heading, demo, i } = req.query as Record<string, string>;
  if (demo === "1") {
    // Deterministic SVG fragment that resembles a recovered Street View frame
    const idx = Number(i ?? 0);
    const hue = (idx * 47) % 360;
    const h = Number(heading ?? 0);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue}, 25%, 14%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 40) % 360}, 30%, 6%)"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${(hue + 180) % 360}, 18%, 18%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 180) % 360}, 14%, 8%)"/>
    </linearGradient>
  </defs>
  <rect width="640" height="220" fill="url(#sky)"/>
  <rect y="220" width="640" height="140" fill="url(#ground)"/>
  <g opacity="0.55" stroke="hsl(${hue}, 20%, 70%)" stroke-width="1" fill="none">
    <path d="M 0 220 L 640 220"/>
    <path d="M ${(idx * 40) % 640} 220 L ${320} 360 L ${((idx * 40) % 640) + 80} 220 Z"/>
    <path d="M ${(idx * 73) % 640} 230 L ${320} 360"/>
  </g>
  <text x="20" y="36" fill="hsl(${hue}, 30%, 78%)" font-family="ui-monospace, Menlo, monospace" font-size="13" opacity="0.8">CANDIDATE STREET-LEVEL VIEW</text>
  <text x="20" y="56" fill="hsl(${hue}, 30%, 70%)" font-family="ui-monospace, Menlo, monospace" font-size="11" opacity="0.65">heading ${Math.round(h)}°  ·  demo frame ${idx}</text>
</svg>`;
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(svg);
    return;
  }
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  if (!key || !pano_id) {
    res.status(404).json({ error: "no imagery" });
    return;
  }
  const url = `https://maps.googleapis.com/maps/api/streetview?size=640x360&pano=${encodeURIComponent(
    pano_id,
  )}&heading=${encodeURIComponent(heading ?? "0")}&fov=90&key=${key}`;
  res.redirect(url);
});

export default router;
