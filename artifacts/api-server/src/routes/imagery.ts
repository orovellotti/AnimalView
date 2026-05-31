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
  const data = MatchImageryResponse.parse({ mode: "real", matches });
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
  res.redirect(url);
});

export default router;
