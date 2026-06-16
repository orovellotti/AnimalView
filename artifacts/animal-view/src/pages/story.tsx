import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import Map, { Source, Layer, Marker, type MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// @ts-expect-error - @turf/turf exports map mismatch
import * as turf from "@turf/turf";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ShieldCheck,
  Ruler,
  CalendarDays,
  Navigation,
  CloudSun,
  Camera,
  Loader2,
  MapPin,
  Footprints,
  Mountain,
} from "lucide-react";
import {
  useListSpecies,
  useListStudies,
  useListIndividuals,
  useGetTrack,
  getGetTrackQueryKey,
  getListStudiesQueryKey,
  getListIndividualsQueryKey,
  matchImagery,
  analyzeImagery,
  getWeather,
  type ImageryMatch,
  type GetWeather200,
} from "@workspace/api-client-react";
import { useLang, type Lang } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type TrackPoint = { lat: number; lon: number; timestamp: string };

type Chapter = {
  pointIndex: number;
  lat: number;
  lon: number;
  timestamp: string;
  cumulativeKm: number;
  legKm: number;
  dayNumber: number;
  match: ImageryMatch;
  weather: GetWeather200 | null;
  description: string | null;
};

type Cover = {
  speciesName: string;
  scientificName?: string;
  individualName: string;
  studyName: string;
  totalKm: number;
  days: number;
  pointCount: number;
  startDate: string;
  endDate: string;
};

const MAX_CHAPTERS = 12;
const MATCH_RADIUS_M = 1500;
// Cap how many points we hand to the imagery matcher: it queries providers per
// point, so a multi-thousand-point track would time out. We still keep full
// resolution for the map line and stats — only the matching input is thinned.
const MAX_MATCH_POINTS = 120;

const confRank = (c?: string) =>
  c === "high" ? 3 : c === "medium" ? 2 : c === "low" ? 1 : 0;

function cleanPoints(raw: TrackPoint[] | undefined | null): TrackPoint[] {
  if (!raw) return [];
  return raw.filter(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lon) <= 180,
  );
}

export default function Story() {
  const { lang, setLang, t } = useLang();
  const locale = lang === "fr" ? "fr-FR" : "en-US";

  const [theme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("animalview-theme");
      if (saved === "light" || saved === "dark") return saved;
    }
    return "dark";
  });

  useEffect(() => {
    document.title = t("story.docTitle");
  }, [t]);

  const [speciesId, setSpeciesId] = useState("");
  const [studyId, setStudyId] = useState("");
  const [individualId, setIndividualId] = useState("");

  const speciesReq = useListSpecies();
  const studiesReq = useListStudies(
    { species: speciesId },
    {
      query: {
        enabled: !!speciesId,
        queryKey: getListStudiesQueryKey({ species: speciesId }),
      },
    },
  );
  const individualsReq = useListIndividuals(
    { studyId },
    {
      query: {
        enabled: !!studyId,
        queryKey: getListIndividualsQueryKey({ studyId }),
      },
    },
  );
  const trackReq = useGetTrack(
    { studyId, individualId },
    {
      query: {
        enabled: !!studyId && !!individualId,
        queryKey: getGetTrackQueryKey({ studyId, individualId }),
      },
    },
  );

  const selectedSpecies = speciesReq.data?.species?.find(
    (s) => s.id === speciesId,
  );

  // --- Story state ---
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [cover, setCover] = useState<Cover | null>(null);
  const [storyPoints, setStoryPoints] = useState<TrackPoint[]>([]);
  const [phase, setPhase] = useState<
    "idle" | "matching" | "enriching" | "done"
  >("idle");
  const [buildError, setBuildError] = useState<string | null>(null);

  const mapRef = useRef<MapRef | null>(null);
  const [activeStep, setActiveStep] = useState(-1); // -1 = cover, n = outro
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  const trackPointsReady = cleanPoints(trackReq.data?.points).length >= 2;
  const building = phase === "matching" || phase === "enriching";

  const resetStory = () => {
    setChapters(null);
    setCover(null);
    setStoryPoints([]);
    setActiveStep(-1);
    setBuildError(null);
    setPhase("idle");
  };

  const handleBuild = async () => {
    const points = cleanPoints(trackReq.data?.points);
    if (points.length < 2) return;
    setBuildError(null);
    setChapters(null);
    setCover(null);
    setActiveStep(-1);
    setStoryPoints(points);
    setPhase("matching");

    try {
      // Thin the points for matching, keeping a map back to original indices.
      const step = Math.max(1, Math.ceil(points.length / MAX_MATCH_POINTS));
      const sampled: TrackPoint[] = [];
      const sampleOrig: number[] = [];
      for (let i = 0; i < points.length; i += step) {
        sampled.push(points[i]);
        sampleOrig.push(i);
      }
      if (sampleOrig[sampleOrig.length - 1] !== points.length - 1) {
        sampled.push(points[points.length - 1]);
        sampleOrig.push(points.length - 1);
      }
      const remap = (i: number) =>
        sampleOrig[Math.min(Math.max(i, 0), sampleOrig.length - 1)] ?? 0;

      const res = await matchImagery({
        points: sampled,
        radius: MATCH_RADIUS_M,
        providers: ["google", "mapillary", "wikimedia"],
        scientificName: selectedSpecies?.scientificName,
      });
      // Normalize matches: remap each provider hit back to a full-track index.
      const terrain = (res.matches || [])
        .filter(
          (m) =>
            m.provider !== "gbif" &&
            !!m.previewUrl &&
            m.imageLat != null &&
            m.imageLon != null,
        )
        .map((m) => ({ m, oi: remap(m.trackPointIndex) }));

      // Whole-track factual cover (works even if no imagery was found).
      const line = turf.lineString(points.map((p) => [p.lon, p.lat]));
      const totalKm = turf.length(line, { units: "kilometers" });
      const startMs = new Date(points[0].timestamp).getTime();
      const endMs = new Date(points[points.length - 1].timestamp).getTime();
      const days =
        Number.isFinite(startMs) && Number.isFinite(endMs)
          ? Math.max(1, Math.round((endMs - startMs) / 86400000))
          : 0;
      setCover({
        speciesName: selectedSpecies?.commonName ?? "",
        scientificName: selectedSpecies?.scientificName,
        individualName: individualId,
        studyName:
          studiesReq.data?.studies?.find((s) => s.id === studyId)?.name ??
          studyId,
        totalKm,
        days,
        pointCount: points.length,
        startDate: points[0].timestamp,
        endDate: points[points.length - 1].timestamp,
      });

      if (terrain.length === 0) {
        setChapters([]);
        setPhase("done");
        return;
      }

      // Select the best photos that are also spread along the track: greedily
      // take highest-quality matches that sit at least `minGap` track points
      // from any already-picked chapter, then relax to fill if too few.
      const byQuality = [...terrain].sort(
        (a, b) =>
          confRank(b.m.confidence) - confRank(a.m.confidence) ||
          a.m.distanceM - b.m.distanceM,
      );
      const minGap = Math.max(1, Math.floor(points.length / (MAX_CHAPTERS * 2)));
      const picked: { m: ImageryMatch; oi: number }[] = [];

      // Always anchor the story with a "start" and "finish" chapter: the real
      // matches that sit closest to the first and last track points. This gives
      // the journey a clear beginning and end instead of starting mid-track.
      const lastOi = points.length - 1;
      const startAnchor = [...terrain].sort((a, b) => a.oi - b.oi)[0];
      const finishAnchor = [...terrain].sort(
        (a, b) => Math.abs(a.oi - lastOi) - Math.abs(b.oi - lastOi),
      )[0];
      if (startAnchor) picked.push(startAnchor);
      if (finishAnchor && finishAnchor !== startAnchor) picked.push(finishAnchor);

      for (const it of byQuality) {
        if (picked.length >= MAX_CHAPTERS) break;
        if (picked.includes(it)) continue;
        if (picked.every((p) => Math.abs(p.oi - it.oi) >= minGap)) {
          picked.push(it);
        }
      }
      for (const it of byQuality) {
        if (picked.length >= MAX_CHAPTERS) break;
        if (!picked.includes(it)) picked.push(it);
      }
      picked.sort((a, b) => a.oi - b.oi);

      // De-dupe any chapters that collapsed onto the same track point.
      const seen = new Set<number>();
      const ordered = picked.filter((it) => {
        const idx = Math.min(Math.max(it.oi, 0), points.length - 1);
        if (seen.has(idx)) return false;
        seen.add(idx);
        return true;
      });

      const base: Chapter[] = ordered.map((it, i) => {
        const m = it.m;
        const pointIndex = Math.min(Math.max(it.oi, 0), points.length - 1);
        const pt = points[pointIndex];
        const cumulativeKm =
          pointIndex >= 1
            ? turf.length(
                turf.lineString(
                  points.slice(0, pointIndex + 1).map((p) => [p.lon, p.lat]),
                ),
                { units: "kilometers" },
              )
            : 0;
        const dn =
          Number.isFinite(startMs) && Number.isFinite(new Date(pt.timestamp).getTime())
            ? Math.max(
                1,
                Math.floor(
                  (new Date(pt.timestamp).getTime() - startMs) / 86400000,
                ) + 1,
              )
            : i + 1;
        return {
          pointIndex,
          lat: pt.lat,
          lon: pt.lon,
          timestamp: pt.timestamp,
          cumulativeKm,
          legKm: 0,
          dayNumber: dn,
          match: m,
          weather: null,
          description: null,
        };
      });
      for (let i = 0; i < base.length; i++) {
        base[i].legKm =
          i === 0
            ? base[i].cumulativeKm
            : base[i].cumulativeKm - base[i - 1].cumulativeKm;
      }

      setPhase("enriching");

      const enriched = await Promise.all(
        base.map(async (ch) => {
          const [weather, description] = await Promise.all([
            getWeather({
              lat: Number(ch.lat.toFixed(1)),
              lon: Number(ch.lon.toFixed(1)),
              timestamp: (() => {
                const d = new Date(ch.timestamp);
                if (Number.isNaN(d.getTime())) return ch.timestamp;
                d.setUTCMinutes(0, 0, 0);
                return d.toISOString();
              })(),
            }).catch(() => null),
            analyzeImagery({
              species: selectedSpecies?.commonName ?? "animal",
              scientificName: selectedSpecies?.scientificName,
              provider: ch.match.provider,
              panoId: ch.match.panoId,
              heading: ch.match.heading,
              imageUrl:
                ch.match.provider === "google"
                  ? undefined
                  : ch.match.previewUrl,
              distanceM: ch.match.distanceM,
            })
              .then((r) => r.narrative)
              .catch(() => null),
          ]);
          return { ...ch, weather, description };
        }),
      );

      setChapters(enriched);
      setActiveStep(-1);
      setPhase("done");
    } catch {
      setBuildError(t("story.error"));
      setPhase("idle");
    }
  };

  // --- Map data ---
  const trackGeojson = useMemo(() => {
    if (storyPoints.length < 2) return null;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: storyPoints.map((p) => [p.lon, p.lat]),
      },
    };
  }, [storyPoints]);

  const progressGeojson = useMemo(() => {
    if (storyPoints.length < 2 || !chapters || activeStep < 0) return null;
    const pIdx =
      activeStep >= chapters.length
        ? storyPoints.length - 1
        : chapters[activeStep].pointIndex;
    const coords = storyPoints.slice(0, pIdx + 1).map((p) => [p.lon, p.lat]);
    if (coords.length < 2) return null;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: coords },
    };
  }, [storyPoints, chapters, activeStep]);

  const fitWholeTrack = () => {
    const map = mapRef.current;
    if (!map || storyPoints.length < 2) return;
    let minLat = storyPoints[0].lat,
      maxLat = storyPoints[0].lat,
      minLon = storyPoints[0].lon,
      maxLon = storyPoints[0].lon;
    for (const p of storyPoints) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }
    if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite)) return;
    const dLat = Math.max(0.002, (maxLat - minLat) * 0.12);
    const dLon = Math.max(0.002, (maxLon - minLon) * 0.12);
    try {
      map.fitBounds(
        [
          [minLon - dLon, minLat - dLat],
          [maxLon + dLon, maxLat + dLat],
        ],
        {
          padding: { top: 80, bottom: 80, left: 80, right: 80 },
          duration: 1400,
          maxZoom: 13,
          // A gentle tilt on the overview hints at the 3D relief without losing
          // the whole-track read.
          pitch: 40,
          bearing: 0,
        },
      );
    } catch {
      /* never let a degenerate bounds blank the map */
    }
  };

  // Drive the camera from the scroll position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !chapters) return;
    if (activeStep < 0 || activeStep >= chapters.length) {
      fitWholeTrack();
    } else {
      const c = chapters[activeStep];
      try {
        map.flyTo({
          center: [c.lon, c.lat],
          zoom: 14,
          // Tilt + slight rotation give each chapter a 3D fly-over feel over the
          // draped terrain. Alternate the bearing so consecutive chapters don't
          // all face the same way.
          pitch: 65,
          bearing: activeStep % 2 === 0 ? -25 : 25,
          duration: 1800,
          essential: true,
        });
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, chapters]);

  // Observe scroll sections → active step.
  useEffect(() => {
    if (!chapters) return;
    const obs = new IntersectionObserver(
      (entries) => {
        // Pick the most-centered intersecting section to avoid jitter when two
        // sections briefly cross the centre band at once.
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) {
          const idx = Number((best.target as HTMLElement).dataset.step ?? "-1");
          setActiveStep(idx);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.5, 1] },
    );
    sectionRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [chapters]);

  const mapStyleConfig = useMemo<any>(
    () => ({
      version: 8,
      sources: {
        "esri-satellite": {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution:
            "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
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
        // Real elevation data (AWS open "Terrain Tiles", terrarium-encoded) —
        // key-less, public DEM used to extrude the satellite imagery into 3D.
        "terrain-dem": {
          type: "raster-dem",
          tiles: [
            "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          encoding: "terrarium",
          maxzoom: 15,
          attribution: "Elevation: AWS Terrain Tiles / Mapzen",
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
      // Drape the imagery over the DEM. Exaggeration sharpens relief in gentle
      // terrain without looking cartoonish in the Alps.
      terrain: { source: "terrain-dem", exaggeration: 1.4 },
    }),
    [],
  );

  const fmtDate = (iso: string, withDay = false) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: withDay ? "numeric" : undefined,
    }).format(d);
  };
  const fmtFullDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(d);
  };
  const fmtKm = (km: number) =>
    km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString(locale);

  const showStory = !!chapters && phase === "done";

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="relative min-h-screen w-full bg-background text-foreground">
        {/* Top bar */}
        <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-sm bg-background/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-primary backdrop-blur-md border border-border hover:opacity-90 transition-opacity"
            >
              <MapPin className="h-3.5 w-3.5" />
              AnimalView
            </Link>
            {showStory && (
              <button
                type="button"
                onClick={resetStory}
                className="flex items-center gap-1.5 rounded-sm bg-background/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur-md border border-border hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("story.reconfigure")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-sm border border-border bg-background/80 backdrop-blur-md">
              {(["fr", "en"] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                    lang === l
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <Link
              href="/explore"
              className="rounded-sm bg-background/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur-md border border-border hover:text-foreground transition-colors"
            >
              {t("story.openMap")}
            </Link>
          </div>
        </header>

        {/* Setup / building screen */}
        {!showStory && (
          <div className="relative flex min-h-screen items-center justify-center px-6">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.5]"
              style={{
                background:
                  "radial-gradient(900px 600px at 78% -8%, rgba(234,179,8,0.16), transparent 60%), radial-gradient(700px 500px at 8% 12%, rgba(103,232,249,0.08), transparent 55%)",
              }}
            />
            <div className="relative w-full max-w-md">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary/80">
                {t("story.kicker")}
              </p>
              <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                {t("story.setupTitle")}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t("story.setupBody")}
              </p>

              {building ? (
                <div className="mt-10 flex flex-col items-center gap-3 rounded-sm border border-border bg-background/60 p-8 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {phase === "matching"
                      ? t("story.phaseMatching")
                      : t("story.phaseEnriching")}
                  </p>
                </div>
              ) : (
                <div className="mt-8 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("controls.species")}
                    </Label>
                    <Select
                      value={speciesId}
                      onValueChange={(v) => {
                        setSpeciesId(v);
                        setStudyId("");
                        setIndividualId("");
                      }}
                    >
                      <SelectTrigger className="bg-background/50 font-mono text-sm">
                        <SelectValue placeholder={t("controls.selectSpecies")} />
                      </SelectTrigger>
                      <SelectContent className={theme === "dark" ? "dark" : ""}>
                        {speciesReq.data?.species?.map((s) => (
                          <SelectItem
                            key={s.id}
                            value={s.id}
                            className="font-mono text-sm"
                          >
                            {s.commonName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("controls.study")}
                    </Label>
                    <Select
                      value={studyId}
                      onValueChange={(v) => {
                        setStudyId(v);
                        setIndividualId("");
                      }}
                      disabled={!speciesId || !studiesReq.data?.studies?.length}
                    >
                      <SelectTrigger className="bg-background/50 font-mono text-sm">
                        <SelectValue placeholder={t("controls.selectStudy")} />
                      </SelectTrigger>
                      <SelectContent className={theme === "dark" ? "dark" : ""}>
                        {studiesReq.data?.studies?.map((s) => (
                          <SelectItem
                            key={s.id}
                            value={s.id}
                            className="font-mono text-sm"
                          >
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("controls.individual")}
                    </Label>
                    <Select
                      value={individualId}
                      onValueChange={setIndividualId}
                      disabled={
                        !studyId || !individualsReq.data?.individuals?.length
                      }
                    >
                      <SelectTrigger className="bg-background/50 font-mono text-sm">
                        <SelectValue
                          placeholder={t("controls.selectIndividual")}
                        />
                      </SelectTrigger>
                      <SelectContent className={theme === "dark" ? "dark" : ""}>
                        {individualsReq.data?.individuals?.map((i) => (
                          <SelectItem
                            key={i.id}
                            value={i.id}
                            className="font-mono text-sm"
                          >
                            {i.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    onClick={handleBuild}
                    disabled={!individualId || !trackPointsReady}
                    className="group mt-2 w-full gap-2 font-mono text-xs uppercase tracking-widest"
                  >
                    {trackReq.isLoading && !!individualId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Footprints className="h-4 w-4" />
                    )}
                    {t("story.build")}
                  </Button>

                  {buildError && (
                    <p className="text-center font-mono text-[10px] uppercase tracking-widest text-destructive">
                      {buildError}
                    </p>
                  )}

                  <div className="flex items-center justify-center gap-2 pt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
                    {t("story.realDataOnly")}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Story viewer */}
        {showStory && cover && (
          <>
            {/* Fixed map: right 56% on desktop, full-bleed background on mobile */}
            <div className="fixed inset-0 z-0 lg:left-auto lg:right-0 lg:w-[56%]">
              <Map
                ref={mapRef}
                initialViewState={{
                  longitude: cover ? storyPoints[0]?.lon ?? 0 : 0,
                  latitude: cover ? storyPoints[0]?.lat ?? 0 : 0,
                  zoom: 9,
                }}
                mapStyle={mapStyleConfig}
                // @ts-expect-error - maplibregl prop accepted at runtime
                maplibregl={maplibregl as any}
                onLoad={() => fitWholeTrack()}
                interactive={false}
                attributionControl={false}
              >
                {trackGeojson && (
                  <Source
                    key="story-track"
                    id="story-track"
                    type="geojson"
                    data={trackGeojson as any}
                  >
                    <Layer
                      id="story-track-line"
                      type="line"
                      layout={{ "line-cap": "round", "line-join": "round" }}
                      paint={{
                        "line-color": "#eab308",
                        "line-width": 2,
                        "line-opacity": 0.4,
                        "line-dasharray": [2, 2],
                      }}
                    />
                  </Source>
                )}
                {progressGeojson && (
                  <Source
                    key="story-progress"
                    id="story-progress"
                    type="geojson"
                    data={progressGeojson as any}
                  >
                    <Layer
                      id="story-progress-line"
                      type="line"
                      layout={{ "line-cap": "round", "line-join": "round" }}
                      paint={{
                        "line-color": "#fde047",
                        "line-width": 3.5,
                        "line-opacity": 0.95,
                      }}
                    />
                  </Source>
                )}
                {chapters.map((c, i) => {
                  const active = i === activeStep;
                  return (
                    <Marker
                      key={`ch-${i}`}
                      longitude={c.lon}
                      latitude={c.lat}
                      anchor="center"
                    >
                      <div
                        className={`flex items-center justify-center rounded-full border transition-all duration-300 ${
                          active
                            ? "h-6 w-6 border-yellow-200 bg-primary shadow-[0_0_18px_rgba(234,179,8,0.9)]"
                            : "h-3 w-3 border-yellow-200/70 bg-primary/60"
                        }`}
                      >
                        {active && (
                          <span className="font-mono text-[10px] font-bold text-primary-foreground">
                            {i + 1}
                          </span>
                        )}
                      </div>
                    </Marker>
                  );
                })}
              </Map>
              {/* Legibility scrim behind the scrolling text (mobile / left edge) */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/95 via-background/40 to-transparent lg:hidden" />
            </div>

            {/* Scrolling narrative column */}
            <div className="relative z-10 w-full lg:w-[44%]">
              {/* Cover */}
              <section
                data-step={-1}
                ref={(el) => {
                  sectionRefs.current[0] = el;
                }}
                className="flex min-h-screen flex-col justify-center px-6 py-24 sm:px-10"
              >
                <div className="rounded-sm border border-border bg-background/85 p-7 backdrop-blur-md sm:p-9">
                  <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary/80">
                    {t("story.kicker")}
                  </p>
                  <h1 className="mt-4 text-3xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                    {cover.individualName}
                  </h1>
                  <p className="mt-2 text-base text-muted-foreground">
                    {cover.speciesName}
                    {cover.scientificName ? (
                      <span className="italic"> · {cover.scientificName}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/70">
                    {cover.studyName}
                  </p>

                  <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border">
                    <Stat
                      icon={<Ruler className="h-3.5 w-3.5" />}
                      label={t("story.statDistance")}
                      value={`${fmtKm(cover.totalKm)} km`}
                    />
                    <Stat
                      icon={<CalendarDays className="h-3.5 w-3.5" />}
                      label={t("story.statDuration")}
                      value={t("story.daysValue", { count: cover.days })}
                    />
                    <Stat
                      icon={<Navigation className="h-3.5 w-3.5" />}
                      label={t("story.statFixes")}
                      value={cover.pointCount.toLocaleString(locale)}
                    />
                    <Stat
                      icon={<CalendarDays className="h-3.5 w-3.5" />}
                      label={t("story.statPeriod")}
                      value={`${fmtDate(cover.startDate)} – ${fmtDate(cover.endDate)}`}
                    />
                  </div>

                  {chapters.length === 0 ? (
                    <p className="mt-7 font-mono text-[11px] leading-relaxed text-muted-foreground/70">
                      {t("story.noImagery")}
                    </p>
                  ) : (
                    <div className="mt-8 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary/80">
                      <ChevronDown className="h-4 w-4 animate-bounce" />
                      {t("story.scrollHint", { count: chapters.length })}
                    </div>
                  )}
                </div>
              </section>

              {/* Chapters */}
              {chapters.map((c, i) => (
                <section
                  key={`sec-${i}`}
                  data-step={i}
                  ref={(el) => {
                    sectionRefs.current[i + 1] = el;
                  }}
                  className="flex min-h-screen flex-col justify-center px-6 py-20 sm:px-10"
                >
                  <div className="overflow-hidden rounded-sm border border-border bg-background/85 backdrop-blur-md">
                    <div className="relative aspect-[4/3] w-full bg-black">
                      {c.match.previewUrl && (
                        <img
                          src={c.match.previewUrl}
                          alt={t("story.photoAlt")}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      )}
                      <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
                      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-sm border border-white/15 bg-black/60 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white/85 backdrop-blur-sm">
                        <span className="text-primary">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {t("story.chapter")}
                      </div>
                      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-sm border border-white/15 bg-black/60 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-white/80 backdrop-blur-sm">
                        <Camera className="h-3 w-3" />
                        {c.match.provider}
                        <span className="text-white/50">
                          · {Math.round(c.match.distanceM)} m
                        </span>
                        {c.match.imageDate ? (
                          <span className="text-white/50">
                            · {fmtDate(c.match.imageDate)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4 p-6">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-primary/80">
                          {t("story.dayLabel", { count: c.dayNumber })} ·{" "}
                          {fmtFullDate(c.timestamp)}
                        </p>
                        <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                          {t("story.legSummary", {
                            cumulative: fmtKm(c.cumulativeKm),
                            leg: fmtKm(Math.max(0, c.legKm)),
                          })}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-border/50 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-primary/70" />
                          {c.lat.toFixed(4)}, {c.lon.toFixed(4)}
                        </span>
                        {c.weather && c.weather.temperatureC != null && (
                          <span className="flex items-center gap-1.5">
                            <CloudSun className="h-3 w-3 text-primary/70" />
                            {Math.round(c.weather.temperatureC)}°C
                            {c.weather.windSpeedKmh != null
                              ? ` · ${Math.round(c.weather.windSpeedKmh)} km/h`
                              : ""}
                          </span>
                        )}
                      </div>

                      {c.description ? (
                        <div className="space-y-1.5">
                          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                            <Mountain className="h-3 w-3 text-primary/70" />
                            {t("story.terrainReading")}
                          </p>
                          <p className="text-sm leading-relaxed text-foreground/90">
                            {c.description}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              ))}

              {/* Outro */}
              {chapters.length > 0 && (
                <section
                  data-step={chapters.length}
                  ref={(el) => {
                    sectionRefs.current[chapters.length + 1] = el;
                  }}
                  className="flex min-h-screen flex-col justify-center px-6 py-24 sm:px-10"
                >
                  <div className="rounded-sm border border-primary/20 bg-primary/[0.05] p-7 backdrop-blur-md sm:p-9">
                    <ShieldCheck className="h-6 w-6 text-primary" />
                    <h2 className="mt-4 text-xl font-semibold tracking-tight">
                      {t("story.outroTitle")}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {t("story.outroBody")}
                    </p>
                    <div className="mt-7 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="rounded-sm border border-border bg-background/70 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t("story.restart")}
                      </button>
                      <Link
                        href="/explore"
                        className="group inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-2 font-mono text-[10px] uppercase tracking-widest text-primary-foreground transition-all hover:opacity-90"
                      >
                        {t("story.openMap")}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                      </Link>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-background p-4">
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        <span className="text-primary/70">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 font-mono text-sm text-foreground">{value}</div>
    </div>
  );
}
