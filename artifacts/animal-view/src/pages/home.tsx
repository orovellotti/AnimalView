import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import Map, { Source, Layer, Marker, type MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// @ts-expect-error - @turf/turf exports map mismatch
import * as turf from "@turf/turf";

import {
  useListSpecies,
  useListStudies,
  getListStudiesQueryKey,
  useListIndividuals,
  getListIndividualsQueryKey,
  useGetTrack,
  getGetTrackQueryKey,
  useMatchImagery,
  useAnalyzeImagery,
  useGetWeather,
  getGetWeatherQueryKey,
  useGetProviders,
  useListSimSpecies,
  getListSimSpeciesQueryKey,
  useSimulateTrack,
  useGetHumanPressure,
  getGetHumanPressureQueryKey,
  useGetHumanPresence,
  getGetHumanPresenceQueryKey,
} from "@workspace/api-client-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import {
  Play,
  Pause,
  Info,
  Crosshair,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Camera,
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudRain,
  CloudSnow,
  CloudFog,
  CloudDrizzle,
  CloudLightning,
  Route,
  TrainFront,
  Waves,
  Building2,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLang, type Lang } from "@/lib/i18n";

function weatherIcon(code: number): LucideIcon {
  if (code === 0) return Sun;
  if (code === 1 || code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return Cloud;
}

const BARRIER_KIND_LABELS: Record<Lang, Record<string, string>> = {
  fr: {
    highway: "Route",
    railway: "Voie ferrée",
    water: "Cours d'eau",
    urban: "Zone urbanisée",
  },
  en: {
    highway: "Road",
    railway: "Railway",
    water: "Waterway",
    urban: "Built-up area",
  },
};

const BARRIER_SUBTYPE_LABELS: Record<Lang, Record<string, string>> = {
  fr: {
    motorway: "Autoroute",
    trunk: "Voie rapide",
    primary: "Route principale",
    secondary: "Route secondaire",
    tertiary: "Route locale",
    rail: "Voie ferrée",
    light_rail: "Train léger",
    narrow_gauge: "Voie étroite",
    river: "Rivière",
    canal: "Canal",
    water: "Plan d'eau",
    residential: "Zone résidentielle",
    industrial: "Zone industrielle",
    commercial: "Zone commerciale",
  },
  en: {
    motorway: "Motorway",
    trunk: "Trunk road",
    primary: "Primary road",
    secondary: "Secondary road",
    tertiary: "Local road",
    rail: "Railway",
    light_rail: "Light rail",
    narrow_gauge: "Narrow gauge",
    river: "River",
    canal: "Canal",
    water: "Water body",
    residential: "Residential area",
    industrial: "Industrial area",
    commercial: "Commercial area",
  },
};

function barrierIcon(kind: string): LucideIcon {
  if (kind === "railway") return TrainFront;
  if (kind === "water") return Waves;
  if (kind === "urban") return Building2;
  return Route;
}

type Mode = "real" | "sim";

interface SimPoint {
  lat: number;
  lon: number;
  timestamp: string;
  habitatScore: number;
  barrierRisk: number;
}

interface SimResult {
  speciesId: string;
  individualId: string;
  points: SimPoint[];
  barriers: { kind: string; subtype?: string; name?: string; lat: number; lon: number }[];
  warnings: string[];
}

export default function Home() {
  const { lang, setLang, t } = useLang();
  const [mode] = useState<Mode>("real");

  // --- Real track state ---
  const [speciesId, setSpeciesId] = useState<string>("");
  const [studyId, setStudyId] = useState<string>("");
  const [individualId, setIndividualId] = useState<string>("");
  const [radius, setRadius] = useState<number>(2000);
  const [showHumanPressure, setShowHumanPressure] = useState<boolean>(false);

  const [basemap, setBasemap] = useState<"dark" | "satellite">("satellite");
  const [showRoads, setShowRoads] = useState<boolean>(true);
  const mapRef = useRef<MapRef | null>(null);

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("animalview-theme");
      if (saved === "light" || saved === "dark") return saved;
    }
    return "dark";
  });
  useEffect(() => {
    window.localStorage.setItem("animalview-theme", theme);
  }, [theme]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  // True while the user is manually stepping through photos, so the
  // auto-follow effect doesn't stomp their selection when the playhead moves.
  const manualPhotoRef = useRef(false);

  const providersReq = useGetProviders();
  const speciesReq = useListSpecies();

  const studiesReq = useListStudies(
    { species: speciesId },
    { query: { enabled: !!speciesId, queryKey: getListStudiesQueryKey({ species: speciesId }) } }
  );

  const individualsReq = useListIndividuals(
    { studyId: studyId },
    { query: { enabled: !!studyId, queryKey: getListIndividualsQueryKey({ studyId: studyId }) } }
  );

  const [isTracking, setIsTracking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const trackReq = useGetTrack(
    { studyId, individualId },
    { query: { enabled: isTracking && mode === "real", queryKey: getGetTrackQueryKey({ studyId, individualId }) } }
  );

  const matchImageryMutation = useMatchImagery();
  const [imageryMatches, setImageryMatches] = useState<any[]>([]);
  const [activeMatch, setActiveMatch] = useState<any | null>(null);

  // --- "Through its eyes" AI narrative ---
  const selectedSpecies = useMemo(
    () => speciesReq.data?.species?.find((s) => s.id === speciesId),
    [speciesReq.data, speciesId],
  );
  const selectedStudy = useMemo(
    () => studiesReq.data?.studies?.find((s) => s.id === studyId),
    [studiesReq.data, studyId],
  );
  const analyzeImageryMutation = useAnalyzeImagery();
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeStatus, setNarrativeStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const narrativeTokenRef = useRef(0);

  useEffect(() => {
    const token = ++narrativeTokenRef.current;
    if (!activeMatch) {
      setNarrative(null);
      setNarrativeStatus("idle");
      return;
    }
    const analyzable =
      activeMatch.provider === "google"
        ? !!activeMatch.panoId
        : !!activeMatch.previewUrl;
    if (!analyzable) {
      setNarrative(null);
      setNarrativeStatus("idle");
      return;
    }
    setNarrative(null);
    setNarrativeStatus("loading");
    analyzeImageryMutation
      .mutateAsync({
        data: {
          species: selectedSpecies?.commonName ?? "wild animal",
          scientificName: selectedSpecies?.scientificName,
          habitat: selectedSpecies?.habitat,
          provider: activeMatch.provider,
          panoId: activeMatch.panoId,
          heading: activeMatch.heading,
          imageUrl:
            activeMatch.provider !== "google"
              ? activeMatch.previewUrl
              : undefined,
          distanceM: activeMatch.distanceM,
        },
      })
      .then((res) => {
        if (token !== narrativeTokenRef.current) return;
        setNarrative(res.narrative);
        setNarrativeStatus("idle");
      })
      .catch(() => {
        if (token !== narrativeTokenRef.current) return;
        setNarrativeStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatch, selectedSpecies]);

  // --- Simulation state ---
  const simSpeciesReq = useListSimSpecies({
    query: { enabled: mode === "sim", queryKey: getListSimSpeciesQueryKey() },
  });
  const [simSpeciesId, setSimSpeciesId] = useState<string>("red-fox");
  const [simDurationHours, setSimDurationHours] = useState<number>(48);
  const [simStart, setSimStart] = useState<{ lat: number; lon: number } | null>(null);
  const [placing, setPlacing] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const simulateMutation = useSimulateTrack();

  const handleLoadTrack = () => {
    setIsTracking(true);
    setCurrentTimeIndex(0);
    setActiveMatch(null);
    setSidebarOpen(false);
  };

  const handleSimulate = async () => {
    if (!simStart) return;
    try {
      const res = await simulateMutation.mutateAsync({
        data: {
          speciesId: simSpeciesId,
          startLat: simStart.lat,
          startLon: simStart.lon,
          durationHours: simDurationHours,
        },
      });
      console.log("[sim] response:", res);
      setSimResult(res as SimResult);
      setCurrentTimeIndex(0);
      setIsPlaying(false);
      setSidebarOpen(false);
    } catch (e) {
      console.error("[sim] error:", e);
      alert(t("controls.simFailed", { msg: (e as Error).message }));
    }
  };

  // Auto-select the real wolf (Boutin Alberta study, Wolf 13791) on first load.
  const didAutoSelectRef = useRef(false);
  useEffect(() => {
    if (didAutoSelectRef.current) return;
    if (mode !== "real") return;
    if (!speciesReq.data?.species) return;
    if (speciesId || studyId || individualId) {
      didAutoSelectRef.current = true;
      return;
    }
    const wolf = speciesReq.data.species.find((s) => s.id === "wolf");
    if (wolf) {
      setSpeciesId("wolf");
      didAutoSelectRef.current = true;
    }
  }, [mode, speciesReq.data, speciesId, studyId, individualId]);

  const didAutoStudyRef = useRef(false);
  useEffect(() => {
    if (didAutoStudyRef.current) return;
    if (speciesId !== "wolf") return;
    const slavc = studiesReq.data?.studies?.find((s) => s.id === "slavc-dispersal");
    if (slavc && !studyId) {
      setStudyId("slavc-dispersal");
      didAutoStudyRef.current = true;
    }
  }, [speciesId, studiesReq.data, studyId]);

  const didAutoIndividualRef = useRef(false);
  useEffect(() => {
    if (didAutoIndividualRef.current) return;
    if (studyId !== "slavc-dispersal") return;
    const slavcInd = individualsReq.data?.individuals?.find((i) => i.id === "Slavc");
    if (slavcInd && !individualId) {
      setIndividualId("Slavc");
      didAutoIndividualRef.current = true;
      setIsTracking(true);
      setCurrentTimeIndex(0);
      setSidebarOpen(false);
    }
  }, [studyId, individualsReq.data, individualId]);

  const handleFindImagery = async () => {
    // Use the sanitized track points so malformed rows never reach the backend
    // imagery matcher (a bad lat/lon would distort distance filtering or error).
    const points = activePoints;
    if (!points || points.length === 0) return;
    setImageryMatches([]);
    try {
      const res = await matchImageryMutation.mutateAsync({
        data: {
          points,
          radius,
          providers: ["google", "mapillary", "wikimedia", "gbif"],
          scientificName: selectedSpecies?.scientificName,
        },
      });
      // New result set: drop any stale selection and re-arm auto-follow so the
      // stepper indexes into the fresh matches by live object reference.
      manualPhotoRef.current = false;
      setActiveMatch(null);
      setImageryMatches(res.matches || []);
    } catch (e) {
      console.error("Imagery error:", e);
    }
  };

  // Clear any previous imagery results (and re-arm auto-fetch) whenever the
  // selected track context changes, so stale counts/photos never linger.
  const didAutoImageryRef = useRef(false);
  useEffect(() => {
    didAutoImageryRef.current = false;
    manualPhotoRef.current = false;
    setImageryMatches([]);
    matchImageryMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, individualId, mode]);

  // Auto-fetch imagery once the real wolf track has loaded.
  useEffect(() => {
    if (didAutoImageryRef.current) return;
    if (mode !== "real") return;
    if (!trackReq.data?.points || trackReq.data.points.length === 0) return;
    if (matchImageryMutation.isPending) return;
    didAutoImageryRef.current = true;
    handleFindImagery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackReq.data, mode]);

  // Unified active points (real OR sim)
  const activePoints = useMemo<
    { lat: number; lon: number; timestamp: string; habitatScore?: number; barrierRisk?: number }[] | null
  >(() => {
    const raw = mode === "sim" ? simResult?.points : trackReq.data?.points;
    if (!raw) return null;
    // Drop any row whose coordinates aren't valid finite lat/lon. A single bad
    // row (NaN/null/out-of-range) would otherwise feed [NaN, NaN] into the map
    // GeoJSON source and fitBounds, throwing an uncaught MapLibre error that
    // blanks the whole interface — which looked like a crash when switching IDs.
    const clean = raw.filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon) &&
        Math.abs(p.lat) <= 90 &&
        Math.abs(p.lon) <= 180,
    );
    return clean.length > 0 ? clean : null;
  }, [mode, simResult, trackReq.data]);

  const trackGeojson = useMemo(() => {
    if (!activePoints || activePoints.length === 0) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: activePoints.map((p) => [p.lon, p.lat]),
      },
    };
  }, [activePoints]);

  // 1 km buffer corridor around the track — the band of landscape the animal
  // actually moved through. Used both as a visible map layer and to clip the
  // human-presence data so the heatmap reflects the corridor, not a circle
  // around the track centroid.
  const trackBuffer = useMemo(() => {
    if (!activePoints || activePoints.length < 2) return null;
    try {
      const line = turf.lineString(activePoints.map((p) => [p.lon, p.lat]));
      return turf.buffer(line, 1, { units: "kilometers" }) ?? null;
    } catch {
      return null;
    }
  }, [activePoints]);

  // Clamp the playhead into range: switching to a shorter track can momentarily
  // leave currentTimeIndex past the end before the reset effect runs.
  const currentPoint =
    activePoints && activePoints.length > 0
      ? activePoints[Math.min(currentTimeIndex, activePoints.length - 1)]
      : undefined;

  // Real historical weather at the current playhead moment. Coordinates are
  // rounded (≈11km) and the time floored to the hour so the query key stays
  // stable across nearby points during playback (cache-friendly, no spam).
  const weatherParams = useMemo(() => {
    if (mode !== "real" || !currentPoint) return null;
    const d = new Date(currentPoint.timestamp);
    if (Number.isNaN(d.getTime())) return null;
    d.setUTCMinutes(0, 0, 0);
    return {
      lat: Number(currentPoint.lat.toFixed(1)),
      lon: Number(currentPoint.lon.toFixed(1)),
      timestamp: d.toISOString(),
    };
  }, [mode, currentPoint]);

  const weatherReq = useGetWeather(
    weatherParams ?? { lat: 0, lon: 0, timestamp: "" },
    {
      query: {
        enabled: !!weatherParams,
        staleTime: Infinity,
        queryKey: getGetWeatherQueryKey(
          weatherParams ?? { lat: 0, lon: 0, timestamp: "" },
        ),
      },
    },
  );
  const weather = weatherParams ? weatherReq.data : undefined;
  const WeatherIcon = weather ? weatherIcon(weather.weatherCode) : null;

  // Comet trail — the last few traversed points up to the current one, for a
  // fading tail effect behind the moving marker.
  const cometTrailGeojson = useMemo(() => {
    if (!activePoints || activePoints.length < 2) return null;
    if (currentTimeIndex < 1) return null;
    const TAIL = 14;
    const start = Math.max(0, currentTimeIndex - TAIL);
    const segment = activePoints.slice(start, currentTimeIndex + 1);
    if (segment.length < 2) return null;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: segment.map((p) => [p.lon, p.lat]),
      },
    };
  }, [activePoints, currentTimeIndex]);

  // Track centroid + extent (for real-mode OSM barrier fetch radius)
  const trackCenter = useMemo(() => {
    if (!activePoints || activePoints.length === 0) return null;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of activePoints) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    const lat = (minLat + maxLat) / 2;
    const lon = (minLon + maxLon) / 2;
    const dLatM = (maxLat - minLat) * 111320;
    const dLonM = (maxLon - minLon) * 111320 * Math.cos((lat * Math.PI) / 180);
    const radius = Math.max(3000, Math.min(20000, Math.max(dLatM, dLonM) / 2 + 2000));
    return { lat, lon, radius };
  }, [activePoints]);

  // Real-mode: fetch OSM potential human-presence features (trails, lifts,
  // huts, parking, roads, settlements) around the track for the heatmap.
  const realPresenceReq = useGetHumanPresence(
    trackCenter
      ? { lat: trackCenter.lat, lon: trackCenter.lon, radius: trackCenter.radius }
      : { lat: 0, lon: 0, radius: 8000 },
    {
      query: {
        enabled: mode === "real" && showHumanPressure && !!trackCenter,
        staleTime: 5 * 60 * 1000,
        queryKey: getGetHumanPresenceQueryKey(
          trackCenter
            ? { lat: trackCenter.lat, lon: trackCenter.lon, radius: trackCenter.radius }
            : { lat: 0, lon: 0, radius: 8000 },
        ),
      },
    },
  );

  // Location-aware barrier probe for the nearest continuity break. The
  // track-wide fetch above is centred on the whole track and capped at 20 km,
  // so for long dispersal tracks it cannot reveal what is near the *current*
  // playhead. We query a small radius around the current point instead,
  // quantised to a ~0.02° grid so the playhead can advance without firing a
  // new request on every tick (the 30 min server cache absorbs the rest).
  const barrierProbe = useMemo(() => {
    if (mode !== "real" || !currentPoint) return null;
    const q = (v: number) => Math.round(v / 0.02) * 0.02;
    return { lat: q(currentPoint.lat), lon: q(currentPoint.lon), radius: 5000 };
  }, [mode, currentPoint]);

  const localBarrierReq = useGetHumanPressure(
    barrierProbe ?? { lat: 0, lon: 0, radius: 5000 },
    {
      query: {
        enabled: mode === "real" && !!barrierProbe,
        staleTime: 30 * 60 * 1000,
        queryKey: getGetHumanPressureQueryKey(
          barrierProbe ?? { lat: 0, lon: 0, radius: 5000 },
        ),
      },
    },
  );

  // Nearest human-made barrier (continuity break) to the current playhead
  // position — road / railway / waterway / built-up area, with OSM detail.
  const nearestBarrier = useMemo(() => {
    if (!currentPoint) return null;
    const barriers =
      mode === "sim" ? simResult?.barriers : localBarrierReq.data?.features;
    if (!barriers || barriers.length === 0) return null;
    const here = turf.point([currentPoint.lon, currentPoint.lat]);
    let best: (typeof barriers)[number] | null = null;
    let bestD = Infinity;
    for (const b of barriers) {
      const d = turf.distance(here, turf.point([b.lon, b.lat]), { units: "meters" });
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) return null;
    return { barrier: best, distanceM: bestD };
  }, [currentPoint, mode, simResult, localBarrierReq.data]);

  // Human-presence heatmap source. In real mode this uses purpose-built OSM
  // presence features (trails, lifts, huts, parking, roads, settlements)
  // each carrying its own intensity weight. In sim mode there is no real OSM
  // fetch, so we approximate from the simulator's barriers (roads + built-up).
  const humanPressureGeojson = useMemo(() => {
    let features: {
      type: "Feature";
      properties: { weight: number };
      geometry: { type: "Point"; coordinates: [number, number] };
    }[];
    if (mode === "real") {
      const presence = realPresenceReq.data?.features;
      if (!presence || presence.length === 0) return null;
      // Clip presence points to the 1 km track-buffer corridor so the heatmap
      // reflects the band the animal actually traversed, not the whole fetch
      // radius around the centroid. Fall back to all points if no buffer yet.
      const inCorridor = trackBuffer
        ? presence.filter((p) => {
            try {
              return turf.booleanPointInPolygon([p.lon, p.lat], trackBuffer as any);
            } catch {
              return true;
            }
          })
        : presence;
      features = inCorridor.map((p) => ({
        type: "Feature" as const,
        properties: { weight: p.weight },
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
      }));
    } else {
      const barriers = simResult?.barriers;
      if (!barriers || barriers.length === 0) return null;
      features = barriers
        .filter((b) => b.kind === "highway" || b.kind === "urban")
        .map((b) => ({
          type: "Feature" as const,
          properties: { weight: b.kind === "highway" ? 1 : 0.6 },
          geometry: { type: "Point" as const, coordinates: [b.lon, b.lat] },
        }));
    }
    if (features.length === 0) return null;
    return { type: "FeatureCollection" as const, features };
  }, [mode, simResult, realPresenceReq.data, trackBuffer]);

  // Auto-fit map to show the entire track whenever a new one appears
  useEffect(() => {
    if (!activePoints || activePoints.length < 2) return;
    const map = mapRef.current;
    if (!map) return;
    let minLat = activePoints[0].lat, maxLat = activePoints[0].lat;
    let minLon = activePoints[0].lon, maxLon = activePoints[0].lon;
    for (const p of activePoints) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite)) return;
    // tiny pad so single-cluster tracks don't get over-zoomed
    const dLat = Math.max(0.001, (maxLat - minLat) * 0.1);
    const dLon = Math.max(0.001, (maxLon - minLon) * 0.1);
    try {
      map.fitBounds(
        [[minLon - dLon, minLat - dLat], [maxLon + dLon, maxLat + dLat]],
        { padding: 80, duration: 1200, maxZoom: 14 },
      );
    } catch {
      // A degenerate/invalid bounds must never take down the whole view.
    }
  }, [activePoints]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && activePoints) {
      interval = setInterval(() => {
        setCurrentTimeIndex((prev) => {
          if (prev >= (activePoints.length || 0) - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / speed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, speed, activePoints]);

  useEffect(() => {
    if (mode !== "real") return;
    if (manualPhotoRef.current) return;
    if (!currentPoint || imageryMatches.length === 0) return;
    const pt = turf.point([currentPoint.lon, currentPoint.lat]);
    let closest = null;
    let minDistance = Infinity;
    // Track the single nearest match overall as a fallback so the panel is
    // never left empty when photos exist — the user must always be able to see
    // (and browse) the matched context pictures, even if none happen to sit
    // near the current playhead position.
    let nearest = null;
    let nearestDistance = Infinity;
    // Prefer the closest available image within the user's search radius (with a
    // small floor) so context imagery tracks the animal as it moves.
    const maxDistance = Math.max(radius, 1500);
    for (const match of imageryMatches) {
      if (match.imageLon && match.imageLat) {
        const matchPt = turf.point([match.imageLon, match.imageLat]);
        const dist = turf.distance(pt, matchPt, { units: "meters" });
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearest = match;
        }
        if (dist <= maxDistance && dist < minDistance) {
          minDistance = dist;
          closest = match;
        }
      }
    }
    setActiveMatch(closest ?? nearest);
  }, [mode, currentPoint, imageryMatches, radius]);

  // --- Photo stepper: candidate images ordered along the track ---
  // Each match is anchored to its nearest track point so we can step through
  // them chronologically and move the playhead to that moment.
  const orderedMatches = useMemo(() => {
    if (mode !== "real" || !activePoints || imageryMatches.length === 0) return [];
    const withIdx = imageryMatches
      .filter((m) => m.imageLon != null && m.imageLat != null)
      .map((m) => {
        const mp = turf.point([m.imageLon, m.imageLat]);
        let bestI = 0;
        let bestD = Infinity;
        for (let i = 0; i < activePoints.length; i++) {
          const p = activePoints[i];
          const d = turf.distance(mp, turf.point([p.lon, p.lat]), { units: "meters" });
          if (d < bestD) {
            bestD = d;
            bestI = i;
          }
        }
        return { match: m, pointIndex: bestI };
      });
    withIdx.sort((a, b) => a.pointIndex - b.pointIndex);
    return withIdx;
  }, [mode, activePoints, imageryMatches]);

  const currentPhotoIndex = useMemo(() => {
    if (!activeMatch) return -1;
    // Match by object reference: imageId is undefined for some providers
    // (e.g. Street View), so comparing imageId would collapse all of them
    // onto the first entry and freeze the stepper.
    return orderedMatches.findIndex((o) => o.match === activeMatch);
  }, [orderedMatches, activeMatch]);

  const goToPhoto = (idx: number) => {
    if (idx < 0 || idx >= orderedMatches.length) return;
    const target = orderedMatches[idx];
    manualPhotoRef.current = true;
    setIsPlaying(false);
    setCurrentTimeIndex(target.pointIndex);
    setActiveMatch(target.match);
  };

  const togglePlay = () => {
    if (!isPlaying) manualPhotoRef.current = false;
    setIsPlaying((p) => !p);
  };

  // Reset playback when switching modes
  useEffect(() => {
    setCurrentTimeIndex(0);
    setIsPlaying(false);
    setActiveMatch(null);
    setPlacing(false);
    manualPhotoRef.current = false;
  }, [mode]);

  const handleMapClick = (e: any) => {
    if (mode !== "sim" || !placing) return;
    const { lng, lat } = e.lngLat;
    setSimStart({ lat, lon: lng });
    setPlacing(false);
  };

  const trackLineColor = mode === "sim" ? "hsl(180, 90%, 55%)" : "hsl(40, 90%, 55%)";

  const mapStyleConfig = useMemo<any>(() => {
    if (basemap === "satellite") {
      return {
        version: 8,
        sources: {
          "esri-satellite": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
            maxzoom: 19,
          },
          "esri-labels": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            maxzoom: 19,
          },
        },
        layers: [
          { id: "esri-satellite", type: "raster", source: "esri-satellite" },
          {
            id: "esri-labels",
            type: "raster",
            source: "esri-labels",
            paint: { "raster-opacity": 0.85 },
          },
        ],
      };
    }
    return "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
  }, [basemap]);

  return (
    <div className={`relative flex h-screen w-full bg-background overflow-hidden text-foreground ${theme === "dark" ? "dark" : ""}`}>
      {/* Floating reopen button when sidebar is collapsed */}
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          title={t("controls.show")}
          className="absolute left-3 top-3 z-30 flex items-center gap-2 px-3 h-9 rounded-sm bg-background/90 backdrop-blur-md border border-border shadow-xl text-[10px] font-mono uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
          {t("controls.label")}
        </button>
      )}

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-80" : "w-0"
        } shrink-0 border-r border-border bg-sidebar/90 backdrop-blur-md flex flex-col z-10 shadow-xl overflow-hidden transition-all duration-300`}
      >
        <div className="p-6 border-b border-border">
          <div className="flex items-start justify-between">
            <Link href="/" className="text-xl tracking-widest font-mono font-bold text-primary mb-1 uppercase hover:opacity-80 transition-opacity">AnimalView</Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              title={t("controls.hide")}
              className="shrink-0 -mr-2 -mt-1 w-8 h-8 flex items-center justify-center rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            {t("mode.subtitleReal")}
          </p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {mode === "real" ? (
            <>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("controls.species")}</Label>
                <Select
                  value={speciesId}
                  onValueChange={(val) => {
                    setSpeciesId(val);
                    setStudyId("");
                    setIndividualId("");
                    setIsTracking(false);
                    setCurrentTimeIndex(0);
                    setIsPlaying(false);
                    setActiveMatch(null);
                  }}
                >
                  <SelectTrigger className="bg-background/50 border-border font-mono text-sm">
                    <SelectValue placeholder={t("controls.selectSpecies")} />
                  </SelectTrigger>
                  <SelectContent className={theme === "dark" ? "dark" : ""}>
                    {speciesReq.data?.species?.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="font-mono text-sm">
                        {s.commonName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("controls.study")}</Label>
                <Select
                  value={studyId}
                  onValueChange={(val) => {
                    setStudyId(val);
                    setIndividualId("");
                    setIsTracking(false);
                    setCurrentTimeIndex(0);
                    setIsPlaying(false);
                    setActiveMatch(null);
                  }}
                  disabled={!speciesId}
                >
                  <SelectTrigger className="bg-background/50 border-border font-mono text-sm">
                    <SelectValue placeholder={t("controls.selectStudy")} />
                  </SelectTrigger>
                  <SelectContent className={theme === "dark" ? "dark" : ""}>
                    {studiesReq.data?.studies?.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="font-mono text-sm">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedStudy?.citation ? (
                  <div className="mt-2 p-3 bg-muted/30 border border-border/50 rounded-sm space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t("controls.dataSource")}
                    </div>
                    {selectedStudy.principalInvestigator ? (
                      <div className="text-xs text-foreground/90">
                        {selectedStudy.principalInvestigator}
                      </div>
                    ) : null}
                    {selectedStudy.location ? (
                      <div className="text-xs text-muted-foreground">
                        {selectedStudy.location}
                      </div>
                    ) : null}
                    <div className="text-[11px] leading-snug text-muted-foreground/90 italic">
                      {selectedStudy.citation}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("controls.individual")}</Label>
                <Select
                  value={individualId}
                  onValueChange={(val) => {
                    setIndividualId(val);
                    setIsTracking(true);
                    setCurrentTimeIndex(0);
                    setIsPlaying(false);
                    setActiveMatch(null);
                  }}
                  disabled={!studyId}
                >
                  <SelectTrigger className="bg-background/50 border-border font-mono text-sm">
                    <SelectValue placeholder={t("controls.selectIndividual")} />
                  </SelectTrigger>
                  <SelectContent className={theme === "dark" ? "dark" : ""}>
                    {individualsReq.data?.individuals?.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="font-mono text-sm">
                        {s.name} {s.nickname ? `"${s.nickname}"` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {individualId && selectedStudy?.url ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 font-mono text-xs"
                  >
                    <a
                      href={selectedStudy.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-2" />
                      {t("controls.viewStudy")}
                    </a>
                  </Button>
                ) : null}
              </div>

              <div className="space-y-4 pt-4 border-t border-border">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex justify-between">
                  <span>{t("controls.searchRadius")}</span>
                  <span className="text-primary">{radius}m</span>
                </Label>
                <Slider
                  value={[radius]}
                  min={500}
                  max={10000}
                  step={500}
                  onValueChange={([val]) => setRadius(val)}
                  className="py-2"
                />
              </div>

              <div className="pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowHumanPressure((v) => !v)}
                  className={`w-full font-mono uppercase tracking-widest text-xs h-10 px-3 rounded border transition-all flex items-center justify-between ${
                    showHumanPressure
                      ? "bg-primary/15 text-primary border-primary/40 shadow-[0_0_12px_rgba(234,179,8,0.25)]"
                      : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/40"
                  }`}
                >
                  <span>{t("controls.humanPressure")}</span>
                  <span
                    className={`inline-block w-8 h-4 rounded-full relative transition-colors ${
                      showHumanPressure ? "bg-primary/60" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-background transition-all ${
                        showHumanPressure ? "left-4" : "left-0.5"
                      }`}
                    />
                  </span>
                </button>
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed font-mono mt-2">
                  {t("controls.humanPressureHint")}
                </p>
              </div>

              <div className="pt-6 space-y-3">
                <Button
                  onClick={handleLoadTrack}
                  disabled={!individualId}
                  className="w-full font-mono uppercase tracking-widest text-xs h-10"
                  variant="outline"
                >
                  {t("controls.loadTrack")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("controls.species")}</Label>
                <Select value={simSpeciesId} onValueChange={setSimSpeciesId}>
                  <SelectTrigger className="bg-background/50 border-border font-mono text-sm">
                    <SelectValue placeholder={t("controls.selectSpecies")} />
                  </SelectTrigger>
                  <SelectContent className={theme === "dark" ? "dark" : ""}>
                    {simSpeciesReq.data?.species?.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="font-mono text-sm">
                        {s.commonName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {simSpeciesReq.data?.species?.find((s) => s.id === simSpeciesId) && (
                  <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-mono pt-1">
                    {simSpeciesReq.data.species.find((s) => s.id === simSpeciesId)!.summary}
                  </p>
                )}
              </div>

              <div className="space-y-4 pt-4 border-t border-border">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex justify-between">
                  <span>{t("controls.duration")}</span>
                  <span className="text-primary">{simDurationHours}h</span>
                </Label>
                <Slider
                  value={[simDurationHours]}
                  min={6}
                  max={720}
                  step={6}
                  onValueChange={([val]) => setSimDurationHours(val)}
                  className="py-2"
                />
                <div className="flex justify-between text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                  <span>6h</span>
                  <span>{t("controls.durationWeek")}</span>
                  <span>{t("controls.durationMonth")}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowHumanPressure((v) => !v)}
                  className={`w-full font-mono uppercase tracking-widest text-xs h-10 px-3 rounded border transition-all flex items-center justify-between ${
                    showHumanPressure
                      ? "bg-primary/15 text-primary border-primary/40 shadow-[0_0_12px_rgba(234,179,8,0.25)]"
                      : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/40"
                  }`}
                >
                  <span>{t("controls.humanPressureHeatmap")}</span>
                  <span
                    className={`inline-block w-8 h-4 rounded-full relative transition-colors ${
                      showHumanPressure ? "bg-primary/60" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-background transition-all ${
                        showHumanPressure ? "left-4" : "left-0.5"
                      }`}
                    />
                  </span>
                </button>
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed font-mono mt-2">
                  {t("controls.humanPressureHintSim")}
                </p>
              </div>

              <div className="pt-4 border-t border-border space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("controls.startLocation")}</Label>
                <button
                  type="button"
                  onClick={() => setPlacing((p) => !p)}
                  className={`w-full font-mono uppercase tracking-widest text-xs h-10 px-3 rounded border transition-all flex items-center justify-between ${
                    placing
                      ? "bg-primary/20 text-primary border-primary/50 shadow-[0_0_12px_rgba(234,179,8,0.3)]"
                      : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/40"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Crosshair className="w-3 h-3" />
                    {placing ? t("controls.clickOnMap") : simStart ? t("controls.replaceIndividual") : t("controls.placeIndividual")}
                  </span>
                </button>
                {simStart && (
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {simStart.lat.toFixed(4)}, {simStart.lon.toFixed(4)}
                  </p>
                )}
              </div>

              <div className="pt-6 space-y-3">
                <Button
                  onClick={handleSimulate}
                  disabled={!simStart || simulateMutation.isPending}
                  className="w-full font-mono uppercase tracking-widest text-xs h-10 bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all"
                >
                  <Sparkles className="w-3 h-3 mr-2" />
                  {simulateMutation.isPending ? t("controls.simulating") : t("controls.generateTrack")}
                </Button>
                {simResult && (
                  <div className="text-[10px] font-mono text-muted-foreground space-y-1 pt-2 border-t border-border">
                    <div className="flex justify-between">
                      <span>{t("controls.points")}</span>
                      <span className="text-primary">{simResult.points.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("controls.osmBarriers")}</span>
                      <span className="text-primary">{simResult.barriers.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("controls.id")}</span>
                      <span>{simResult.individualId}</span>
                    </div>
                    {simResult.warnings.map((w, i) => (
                      <p key={i} className="text-amber-600/90 dark:text-amber-400/70 pt-1">⚠ {w}</p>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-border text-[10px] text-muted-foreground/60 leading-relaxed font-mono">
          {mode === "sim" ? (
            <p>
              {t("disclaimer.sim.prefix")}<span className="text-amber-700 dark:text-amber-400/90">{t("disclaimer.sim.highlight")}</span>{t("disclaimer.sim.suffix")}
            </p>
          ) : (
            <p>
              {t("disclaimer.real")}
            </p>
          )}
        </div>
      </div>

      {/* Main Map */}
      <div className="flex-1 relative">
        <Map
          ref={mapRef}
          initialViewState={{ longitude: -115.5, latitude: 51.1, zoom: 10 }}
          mapStyle={mapStyleConfig}
          // @ts-expect-error - maplibregl prop accepted at runtime
          maplibregl={maplibregl as any}
          onClick={handleMapClick}
          cursor={mode === "sim" && placing ? "crosshair" : undefined}
        >
          {/* Roads & hiking-trail overlays (satellite only, toggleable) — under the labels layer */}
          {basemap === "satellite" && showRoads && (
            <Source
              key="osm-trails"
              id="osm-trails"
              type="raster"
              tiles={["https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png"]}
              tileSize={256}
              maxzoom={18}
              attribution="Hiking trails © waymarkedtrails.org, OpenStreetMap contributors"
            >
              <Layer
                id="osm-trails"
                type="raster"
                paint={{ "raster-opacity": 0.9 }}
                beforeId="esri-labels"
              />
            </Source>
          )}
          {basemap === "satellite" && showRoads && (
            <Source
              key="esri-transportation"
              id="esri-transportation"
              type="raster"
              tiles={["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"]}
              tileSize={256}
              maxzoom={19}
              attribution="Roads © Esri, HERE, Garmin, OpenStreetMap contributors"
            >
              <Layer
                id="esri-transportation"
                type="raster"
                paint={{ "raster-opacity": 0.9 }}
                beforeId="esri-labels"
              />
            </Source>
          )}
          {/* 1 km buffer corridor around the track */}
          {trackBuffer && (
            <Source key="track-buffer" id="track-buffer" type="geojson" data={trackBuffer as any}>
              <Layer
                id="track-buffer-fill"
                type="fill"
                paint={{
                  "fill-color": mode === "sim" ? "#67e8f9" : "#eab308",
                  "fill-opacity": 0.08,
                }}
              />
              <Layer
                id="track-buffer-outline"
                type="line"
                paint={{
                  "line-color": mode === "sim" ? "#67e8f9" : "#eab308",
                  "line-width": 1,
                  "line-opacity": 0.35,
                  "line-dasharray": [3, 2],
                }}
              />
            </Source>
          )}

          {trackGeojson && (
            <Source key="track" id="track" type="geojson" data={trackGeojson as any}>
              <Layer
                id="track-line"
                type="line"
                paint={{
                  "line-color": trackLineColor,
                  "line-width": mode === "sim" ? 2 : 2.5,
                  "line-opacity": mode === "sim" ? 0.85 : 0.75,
                  "line-blur": 0,
                  "line-dasharray": mode === "sim" ? [2, 1.5] : [1, 0],
                }}
              />
            </Source>
          )}

          {/* Comet trail — fading glow behind the moving point */}
          {cometTrailGeojson && (
            <Source key="comet-trail" id="comet-trail" type="geojson" lineMetrics data={cometTrailGeojson as any}>
              <Layer
                id="comet-trail-glow"
                type="line"
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{
                  "line-width": 9,
                  "line-blur": 8,
                  "line-gradient": [
                    "interpolate", ["linear"], ["line-progress"],
                    0, mode === "sim" ? "rgba(103,232,249,0)" : "rgba(234,179,8,0)",
                    1, mode === "sim" ? "rgba(103,232,249,0.5)" : "rgba(234,179,8,0.5)",
                  ],
                }}
              />
              <Layer
                id="comet-trail-core"
                type="line"
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{
                  "line-width": 3,
                  "line-gradient": [
                    "interpolate", ["linear"], ["line-progress"],
                    0, mode === "sim" ? "rgba(165,243,252,0)" : "rgba(254,240,138,0)",
                    0.6, mode === "sim" ? "rgba(103,232,249,0.6)" : "rgba(234,179,8,0.6)",
                    1, mode === "sim" ? "rgba(224,255,255,1)" : "rgba(255,247,200,1)",
                  ],
                }}
              />
            </Source>
          )}

          {/* Human-presence heatmap (OSM-derived: trails, lifts, huts, parking, roads, settlements) */}
          {showHumanPressure && humanPressureGeojson && (
            <Source key="human-pressure-heat" id="human-pressure-heat" type="geojson" data={humanPressureGeojson as any}>
              <Layer
                id="human-pressure-heat-layer"
                type="heatmap"
                paint={{
                  "heatmap-weight": ["get", "weight"],
                  "heatmap-intensity": [
                    "interpolate", ["linear"], ["zoom"],
                    6, 1.5,
                    10, 3,
                    14, 5,
                  ],
                  "heatmap-radius": [
                    "interpolate", ["linear"], ["zoom"],
                    6, 20,
                    10, 40,
                    13, 70,
                    16, 100,
                  ],
                  "heatmap-opacity": 0.85,
                  "heatmap-color": [
                    "interpolate", ["linear"], ["heatmap-density"],
                    0, "rgba(0,0,0,0)",
                    0.05, "rgba(56,189,248,0.5)",
                    0.2, "rgba(234,179,8,0.7)",
                    0.45, "rgba(249,115,22,0.85)",
                    0.8, "rgba(220,38,38,0.95)",
                    1, "rgba(127,29,29,1)",
                  ],
                }}
              />
            </Source>
          )}

          {/* Simulation barriers */}
          {mode === "sim" && !showHumanPressure &&
            simResult?.barriers.slice(0, 250).map((b, i) => (
              <Marker key={`barrier-${i}`} longitude={b.lon} latitude={b.lat}>
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    b.kind === "highway"
                      ? "bg-red-500/70"
                      : b.kind === "water"
                      ? "bg-blue-400/70"
                      : "bg-amber-500/60"
                  }`}
                />
              </Marker>
            ))}

          {/* Sim start marker */}
          {mode === "sim" && simStart && (
            <Marker longitude={simStart.lon} latitude={simStart.lat}>
              <div className="w-3 h-3 rounded-full border-2 border-cyan-300 bg-cyan-300/30 shadow-[0_0_10px_rgba(103,232,249,0.8)]" />
            </Marker>
          )}

          {/* Imagery matches (real only) */}
          {mode === "real" &&
            imageryMatches.map(
              (match, i) =>
                match.imageLon &&
                match.imageLat && (
                  <Marker key={`match-${i}`} longitude={match.imageLon} latitude={match.imageLat}>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        match.provider === "google" ? "bg-blue-500" : "bg-green-500"
                      } ${
                        activeMatch === match
                          ? "ring-4 ring-primary/50 bg-primary shadow-[0_0_15px_rgba(234,179,8,0.8)]"
                          : "opacity-40"
                      }`}
                    />
                  </Marker>
                ),
            )}

          {currentPoint && (
            <Marker longitude={currentPoint.lon} latitude={currentPoint.lat}>
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center animate-pulse ${
                  mode === "sim"
                    ? "bg-cyan-300 shadow-[0_0_20px_rgba(103,232,249,1)]"
                    : "bg-primary shadow-[0_0_20px_rgba(234,179,8,1)]"
                }`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-black" />
              </div>
            </Marker>
          )}
        </Map>

        {/* Simulation disclaimer banner */}
        {mode === "sim" && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-amber-400/10 border border-amber-400/30 backdrop-blur-md rounded-sm text-[10px] font-mono uppercase tracking-widest text-amber-300">
            <span className="pointer-events-none">
              {t("banner.simMovements")}
            </span>
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-amber-400/40 hover:bg-amber-400/20 transition-colors"
                  aria-label={t("about.aria")}
                >
                  <Info className="w-3 h-3" />
                  {t("about.button")}
                </button>
              </DialogTrigger>
              <DialogContent className={`max-w-2xl max-h-[80vh] overflow-y-auto ${theme === "dark" ? "dark" : ""}`}>
                <DialogHeader>
                  <DialogTitle className="font-mono uppercase tracking-widest text-primary">
                    {t("about.title")}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm text-muted-foreground leading-relaxed font-mono">
                  <p>
                    {t("about.intro.1")}<span className="text-foreground">{t("about.intro.plausible")}</span>{t("about.intro.2")}<span className="text-foreground">{t("about.intro.might")}</span>{t("about.intro.3")}
                  </p>

                  <div>
                    <h3 className="text-foreground text-xs uppercase tracking-widest mb-2">
                      {t("about.s1.title")}
                    </h3>
                    <p>
                      {t("about.s1.body")}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-foreground text-xs uppercase tracking-widest mb-2">
                      {t("about.s2.title")}
                    </h3>
                    <p>
                      {t("about.s2.body")}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-foreground text-xs uppercase tracking-widest mb-2">
                      {t("about.s3.title")}
                    </h3>
                    <p>
                      {t("about.s3.body.1")}<span className="text-red-600 dark:text-red-400">{t("about.s3.roads")}</span>{t("about.s3.mid1")}
                      <span className="text-blue-600 dark:text-blue-400">{t("about.s3.water")}</span>{t("about.s3.mid2")}
                      <span className="text-amber-700 dark:text-amber-400">{t("about.s3.urban")}</span>{t("about.s3.body.2")}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-foreground text-xs uppercase tracking-widest mb-2">
                      {t("about.s4.title")}
                    </h3>
                    <p>
                      {t("about.s4.body.1")}
                    </p>
                    <pre className="text-[11px] bg-background/60 border border-border rounded-sm p-3 my-2 text-foreground overflow-x-auto">
{`score = w_habitat · habitat(p)
      − w_barrier · barrierRisk(p)
      − w_turn    · |Δheading|
      + w_explore · noise`}
                    </pre>
                    <p>
                      {t("about.s4.body.2")}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-foreground text-xs uppercase tracking-widest mb-2">
                      {t("about.s5.title")}
                    </h3>
                    <p>
                      {t("about.s5.body")}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <h3 className="text-amber-700 dark:text-amber-300 text-xs uppercase tracking-widest mb-2">
                      {t("about.limits.title")}
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>{t("about.limits.1")}</li>
                      <li>{t("about.limits.2")}</li>
                      <li>{t("about.limits.3")}</li>
                      <li>
                        {t("about.limits.4")}
                      </li>
                    </ul>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Top-right controls: language + theme + basemap */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <div className="flex bg-background/85 backdrop-blur-md border border-border rounded-sm overflow-hidden shadow-lg">
            {(["fr", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                  lang === l
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}
            className="flex items-center justify-center h-[31px] w-[31px] bg-background/85 backdrop-blur-md border border-border rounded-sm text-muted-foreground hover:text-primary transition-colors shadow-lg"
          >
            {theme === "dark" ? (
              <Sun className="w-3.5 h-3.5" />
            ) : (
              <Moon className="w-3.5 h-3.5" />
            )}
          </button>
          <div className="flex bg-background/85 backdrop-blur-md border border-border rounded-sm overflow-hidden shadow-lg">
            {(["dark", "satellite"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBasemap(b)}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                  basemap === b
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`basemap.${b}`)}
              </button>
            ))}
          </div>
          {basemap === "satellite" && (
            <button
              type="button"
              onClick={() => setShowRoads((v) => !v)}
              title={t("basemap.roadsHint")}
              className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors bg-background/85 backdrop-blur-md border border-border rounded-sm shadow-lg ${
                showRoads
                  ? "text-primary bg-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("basemap.roads")}
            </button>
          )}
        </div>

        {/* Placement hint */}
        {mode === "sim" && placing && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-primary/15 border border-primary/40 backdrop-blur-md rounded-sm text-[10px] font-mono uppercase tracking-widest text-primary pointer-events-none">
            {t("banner.placeIndividual")}
          </div>
        )}

        {/* Bottom Player */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pointer-events-none flex justify-center">
          <Card className="pointer-events-auto bg-background/90 backdrop-blur-xl border-border w-full max-w-3xl flex items-center p-4 gap-6 shadow-2xl">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full" onClick={togglePlay}>
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
              </Button>
              <div className="flex flex-col ml-2">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{t("player.speed")}</span>
                <div className="flex gap-1 mt-1">
                  {[1, 5, 20, 100].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        speed === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-2">
              <div className="flex justify-between font-mono text-[10px] uppercase text-muted-foreground tracking-widest">
                <span>{currentPoint ? new Date(currentPoint.timestamp).toLocaleString() : "---"}</span>
                <span>{currentPoint ? `${currentPoint.lat.toFixed(5)}, ${currentPoint.lon.toFixed(5)}` : "---"}</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden relative">
                <div
                  className="absolute top-0 bottom-0 left-0 bg-primary transition-all duration-200"
                  style={{
                    width: `${activePoints?.length ? (currentTimeIndex / activePoints.length) * 100 : 0}%`,
                  }}
                />
                {orderedMatches.map((o, i) => (
                  <button
                    key={o.match.imageId ?? i}
                    title={t("player.photo", { n: i + 1 })}
                    onClick={() => goToPhoto(i)}
                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-colors ${
                      i === currentPhotoIndex
                        ? "bg-primary ring-2 ring-primary/40"
                        : "bg-muted-foreground/60 hover:bg-primary/70"
                    }`}
                    style={{
                      left: `${activePoints?.length ? (o.pointIndex / activePoints.length) * 100 : 0}%`,
                    }}
                  />
                ))}
              </div>
            </div>

            {mode === "real" && orderedMatches.length > 0 && (
              <div className="flex items-center gap-1.5 border-l border-border pl-4">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full"
                  disabled={currentPhotoIndex <= 0}
                  onClick={() => goToPhoto((currentPhotoIndex < 0 ? 1 : currentPhotoIndex) - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex flex-col items-center min-w-[52px]">
                  <Camera className="w-3 h-3 text-muted-foreground mb-0.5" />
                  <span className="text-[10px] font-mono text-primary tabular-nums">
                    {currentPhotoIndex >= 0 ? currentPhotoIndex + 1 : "–"}/{orderedMatches.length}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full"
                  disabled={currentPhotoIndex >= orderedMatches.length - 1}
                  onClick={() => goToPhoto(currentPhotoIndex < 0 ? 0 : currentPhotoIndex + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {mode === "real" && WeatherIcon && weather && (
              <div
                className="flex items-center gap-2.5 border-l border-border pl-4"
                title={`${weather.label}${
                  weather.windSpeedKmh != null ? ` · ${t("weather.windTip", { value: Math.round(weather.windSpeedKmh) })}` : ""
                }${
                  weather.precipitationMm != null ? ` · ${t("weather.precipTip", { value: weather.precipitationMm })}` : ""
                }`}
              >
                <WeatherIcon className="w-6 h-6 text-primary shrink-0" />
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-mono text-foreground tabular-nums">
                    {weather.temperatureC != null ? `${Math.round(weather.temperatureC)}°C` : "—"}
                  </span>
                  <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground max-w-[80px] truncate">
                    {weather.label}
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-80 border-l border-border bg-sidebar/95 backdrop-blur-md flex flex-col z-10 relative shadow-[-10px_0_30px_rgba(0,0,0,0.5)] transition-all duration-500">
        <div className="p-6 border-b border-border flex items-center gap-2 text-primary">
          <Info className="w-4 h-4" />
          <h2 className="text-xs uppercase tracking-widest font-mono font-bold">
            {mode === "sim" ? t("ctx.ecologyReadout") : t("ctx.candidateContext")}
          </h2>
        </div>

        {mode !== "sim" && (
          <div className="p-6 border-b border-border space-y-3 shrink-0">
              <Button
                onClick={handleFindImagery}
                disabled={!trackReq.data?.points || matchImageryMutation.isPending}
                className="w-full font-mono uppercase tracking-widest text-xs h-10 bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all"
              >
                {matchImageryMutation.isPending ? t("ctx.searching") : t("ctx.findImagery")}
              </Button>
              {!matchImageryMutation.isPending &&
                matchImageryMutation.isSuccess &&
                imageryMatches.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/70 leading-relaxed font-mono">
                    {t("ctx.noPhotos")}
                  </p>
                )}
              {!matchImageryMutation.isPending &&
                matchImageryMutation.isSuccess &&
                imageryMatches.length > 0 && (
                  <p className="text-[10px] text-primary/80 leading-relaxed font-mono">
                    {imageryMatches.length === 1
                      ? t("ctx.imagesFound", { count: imageryMatches.length })
                      : t("ctx.imagesFoundPlural", { count: imageryMatches.length })}
                  </p>
                )}
          </div>
        )}
        <div className="flex-1 p-6 overflow-y-auto">
          {mode === "sim" ? (
            currentPoint && simResult ? (
              <div className="space-y-4 font-mono text-[11px] text-muted-foreground/80">
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="uppercase tracking-widest text-muted-foreground">{t("eco.habitatScore")}</span>
                    <span className="text-primary">{(currentPoint.habitatScore ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-400/70"
                      style={{ width: `${Math.round((currentPoint.habitatScore ?? 0) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="uppercase tracking-widest text-muted-foreground">{t("eco.barrierRisk")}</span>
                    <span className="text-red-600 dark:text-red-300">{(currentPoint.barrierRisk ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-400/70"
                      style={{ width: `${Math.round((currentPoint.barrierRisk ?? 0) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="p-4 bg-muted/30 border border-border/50 rounded-sm mt-8">
                  <p className="text-[10px] font-mono leading-relaxed text-muted-foreground">
                    {t("eco.step", { current: currentTimeIndex + 1, total: simResult.points.length })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                <div className="w-12 h-12 border border-dashed border-muted-foreground/30 rounded-full flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground max-w-[200px]">
                  {simStart ? t("eco.generatePrompt") : t("eco.placePrompt")}
                </p>
              </div>
            )
          ) : activeMatch ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="relative aspect-video rounded-sm overflow-hidden border border-border bg-black">
                {activeMatch.previewUrl ? (
                  <img
                    src={activeMatch.previewUrl}
                    alt={t("ctx.candidateAlt")}
                    loading="lazy"
                    decoding="async"
                    className="object-cover w-full h-full opacity-80 mix-blend-screen grayscale-[20%] contrast-125"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-xs">
                    {t("ctx.noPreview")}
                  </div>
                )}
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" />
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-sm border border-white/10 text-[9px] font-mono uppercase text-white/80 tracking-widest">
                  {activeMatch.provider}
                </div>
                {orderedMatches.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label={t("ctx.prevPhoto")}
                      disabled={currentPhotoIndex <= 0}
                      onClick={() => goToPhoto((currentPhotoIndex < 0 ? 1 : currentPhotoIndex) - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-white/90 hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("ctx.nextPhoto")}
                      disabled={currentPhotoIndex >= orderedMatches.length - 1}
                      onClick={() => goToPhoto(currentPhotoIndex < 0 ? 0 : currentPhotoIndex + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-white/90 hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {orderedMatches.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPhotoIndex <= 0}
                    onClick={() => goToPhoto((currentPhotoIndex < 0 ? 1 : currentPhotoIndex) - 1)}
                    className="h-9 px-3 font-mono text-[10px] uppercase tracking-widest gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {t("ctx.prev")}
                  </Button>
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums tracking-widest">
                    {currentPhotoIndex >= 0 ? currentPhotoIndex + 1 : "–"} / {orderedMatches.length}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPhotoIndex >= orderedMatches.length - 1}
                    onClick={() => goToPhoto(currentPhotoIndex < 0 ? 0 : currentPhotoIndex + 1)}
                    className="h-9 px-3 font-mono text-[10px] uppercase tracking-widest gap-1"
                  >
                    {t("ctx.next")}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {orderedMatches.length > 1 && (
                <div className="space-y-2">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                    {t("ctx.allPhotos", { count: orderedMatches.length })}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {orderedMatches.map((o, idx) => (
                      <button
                        type="button"
                        key={`${o.match.provider}:${o.match.imageId ?? o.match.panoId ?? idx}`}
                        onClick={() => goToPhoto(idx)}
                        aria-label={`${o.match.provider} ${idx + 1}`}
                        className={`relative aspect-square overflow-hidden rounded-sm border transition-all ${
                          idx === currentPhotoIndex
                            ? "border-primary ring-1 ring-primary"
                            : "border-border/60 hover:border-primary/60"
                        }`}
                      >
                        {o.match.previewUrl ? (
                          <img
                            src={o.match.previewUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted" />
                        )}
                        <span className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 text-[7px] font-mono uppercase tracking-wider text-white/80 truncate">
                          {o.match.provider}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3 font-mono text-[11px] text-muted-foreground/80">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="uppercase tracking-widest text-muted-foreground">{t("ctx.confidence")}</span>
                  <span className={activeMatch.confidence === "high" ? "text-primary" : ""}>
                    {activeMatch.confidence}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="uppercase tracking-widest text-muted-foreground">{t("ctx.distance")}</span>
                  <span>{t("ctx.meters", { count: Math.round(activeMatch.distanceM) })}</span>
                </div>
                {activeMatch.imageDate && (
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="uppercase tracking-widest text-muted-foreground">{t("ctx.imageDate")}</span>
                    <span>{activeMatch.imageDate}</span>
                  </div>
                )}
              </div>

              {WeatherIcon && weather && (
                <div className="p-4 bg-muted/30 border border-border/50 rounded-sm mt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <WeatherIcon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[9px] font-mono uppercase tracking-widest text-primary">
                      {selectedSpecies?.commonName
                        ? t("weather.title", { name: selectedSpecies.commonName })
                        : t("weather.titleFallback")}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-2xl font-mono text-foreground tabular-nums">
                      {weather.temperatureC != null ? `${Math.round(weather.temperatureC)}°C` : "—"}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {weather.label}
                    </span>
                  </div>
                  <div className="space-y-2 font-mono text-[11px] text-muted-foreground/80">
                    {currentPoint?.timestamp && (
                      <div className="flex justify-between border-b border-border/50 pb-2">
                        <span className="uppercase tracking-widest text-muted-foreground">{t("weather.date")}</span>
                        <span>
                          {new Date(currentPoint.timestamp).toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "UTC",
                          })}{" "}
                          UTC
                        </span>
                      </div>
                    )}
                    {weather.windSpeedKmh != null && (
                      <div className="flex justify-between border-b border-border/50 pb-2">
                        <span className="uppercase tracking-widest text-muted-foreground">{t("weather.wind")}</span>
                        <span>{Math.round(weather.windSpeedKmh)} km/h</span>
                      </div>
                    )}
                    {weather.precipitationMm != null && (
                      <div className="flex justify-between border-b border-border/50 pb-2">
                        <span className="uppercase tracking-widest text-muted-foreground">{t("weather.precip")}</span>
                        <span>{weather.precipitationMm} mm</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] font-mono leading-relaxed text-muted-foreground/60 mt-3">
                    {t("weather.source")}
                  </p>
                </div>
              )}

              {nearestBarrier &&
                (() => {
                  const b = nearestBarrier.barrier;
                  const BarrierIcon = barrierIcon(b.kind);
                  const kindLabel = BARRIER_KIND_LABELS[lang][b.kind] ?? b.kind;
                  const detailLabel = b.subtype
                    ? BARRIER_SUBTYPE_LABELS[lang][b.subtype] ?? b.subtype
                    : null;
                  return (
                    <div className="p-4 bg-muted/30 border border-border/50 rounded-sm mt-6">
                      <div className="flex items-center gap-2 mb-3">
                        <BarrierIcon className="w-3.5 h-3.5 text-red-600 dark:text-red-300" />
                        <span className="text-[9px] font-mono uppercase tracking-widest text-red-600 dark:text-red-300">
                          {t("barrier.title")}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-base font-mono text-foreground">
                          {detailLabel ?? kindLabel}
                        </span>
                        {b.name && (
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {b.name}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 font-mono text-[11px] text-muted-foreground/80">
                        <div className="flex justify-between border-b border-border/50 pb-2">
                          <span className="uppercase tracking-widest text-muted-foreground">{t("barrier.type")}</span>
                          <span>{kindLabel}</span>
                        </div>
                        {detailLabel && (
                          <div className="flex justify-between border-b border-border/50 pb-2">
                            <span className="uppercase tracking-widest text-muted-foreground">{t("barrier.detail")}</span>
                            <span>{detailLabel}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-b border-border/50 pb-2">
                          <span className="uppercase tracking-widest text-muted-foreground">{t("barrier.distance")}</span>
                          <span
                            className={nearestBarrier.distanceM < 200 ? "text-red-600 dark:text-red-300" : ""}
                          >
                            {nearestBarrier.distanceM < 1000
                              ? `${Math.round(nearestBarrier.distanceM)} m`
                              : `${(nearestBarrier.distanceM / 1000).toFixed(1)} km`}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] font-mono leading-relaxed text-muted-foreground/60 mt-3">
                        {t("barrier.note")}
                      </p>
                    </div>
                  );
                })()}

              <div className="p-4 bg-primary/5 border border-primary/20 rounded-sm mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span className="text-[9px] font-mono uppercase tracking-widest text-primary">
                    {selectedSpecies?.commonName
                      ? t("ctx.throughEyes", { name: selectedSpecies.commonName })
                      : t("ctx.throughEyesFallback")}
                  </span>
                </div>
                {narrativeStatus === "loading" && (
                  <p className="text-[11px] font-mono text-muted-foreground animate-pulse">
                    {t("ctx.readingScene")}
                  </p>
                )}
                {narrativeStatus === "error" && (
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {t("ctx.sceneError")}
                  </p>
                )}
                {narrativeStatus === "idle" && narrative && (
                  <p className="text-[12px] leading-relaxed text-foreground/90 italic">
                    “{narrative}”
                  </p>
                )}
              </div>

              <div className="p-3 bg-muted/30 border border-border/50 rounded-sm mt-3">
                <p className="text-[10px] font-mono leading-relaxed text-muted-foreground">
                  {t("ctx.aiInterpretation", { count: Math.round(activeMatch.distanceM) })}
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <div className="w-12 h-12 border border-dashed border-muted-foreground/30 rounded-full flex items-center justify-center">
                <div className="w-1 h-1 bg-muted-foreground rounded-full animate-pulse" />
              </div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground max-w-[200px]">
                {trackReq.data?.points ? t("ctx.scanPrompt") : t("ctx.loadPrompt")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
