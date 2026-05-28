import { useState, useMemo, useEffect, useRef } from "react";
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
  useGetProviders,
  useListSimSpecies,
  getListSimSpeciesQueryKey,
  useSimulateTrack,
} from "@workspace/api-client-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Play, Pause, Info, Crosshair, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  barriers: { kind: string; lat: number; lon: number }[];
  warnings: string[];
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("real");

  // --- Real track state ---
  const [speciesId, setSpeciesId] = useState<string>("");
  const [studyId, setStudyId] = useState<string>("");
  const [individualId, setIndividualId] = useState<string>("");
  const [radius, setRadius] = useState<number>(2000);
  const [showHumanPressure, setShowHumanPressure] = useState<boolean>(false);

  const [basemap, setBasemap] = useState<"dark" | "satellite">("dark");
  const mapRef = useRef<MapRef | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);

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

  const trackReq = useGetTrack(
    { studyId, individualId },
    { query: { enabled: isTracking && mode === "real", queryKey: getGetTrackQueryKey({ studyId, individualId }) } }
  );

  const matchImageryMutation = useMatchImagery();
  const [imageryMatches, setImageryMatches] = useState<any[]>([]);
  const [activeMatch, setActiveMatch] = useState<any | null>(null);

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
    } catch (e) {
      console.error("[sim] error:", e);
      alert("Simulation failed: " + (e as Error).message);
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
    const boutin = studiesReq.data?.studies?.find((s) => s.id === "boutin-alberta-wolf");
    if (boutin && !studyId) {
      setStudyId("boutin-alberta-wolf");
      didAutoStudyRef.current = true;
    }
  }, [speciesId, studiesReq.data, studyId]);

  const didAutoIndividualRef = useRef(false);
  useEffect(() => {
    if (didAutoIndividualRef.current) return;
    if (studyId !== "boutin-alberta-wolf") return;
    const wolfInd = individualsReq.data?.individuals?.find((i) => i.id === "13791");
    if (wolfInd && !individualId) {
      setIndividualId("13791");
      didAutoIndividualRef.current = true;
      setIsTracking(true);
      setCurrentTimeIndex(0);
    }
  }, [studyId, individualsReq.data, individualId]);

  const handleFindImagery = async () => {
    if (!trackReq.data?.points) return;
    try {
      const res = await matchImageryMutation.mutateAsync({
        data: {
          points: trackReq.data.points,
          radius,
          providers: ["google", "mapillary", "wikimedia"],
        },
      });
      setImageryMatches(res.matches || []);
    } catch (e) {
      console.error("Imagery error:", e);
    }
  };

  // Auto-fetch imagery once the real wolf track has loaded.
  const didAutoImageryRef = useRef(false);
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
    if (mode === "sim") return simResult?.points ?? null;
    return trackReq.data?.points ?? null;
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

  const currentPoint = activePoints?.[currentTimeIndex];

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
    // tiny pad so single-cluster tracks don't get over-zoomed
    const dLat = Math.max(0.001, (maxLat - minLat) * 0.1);
    const dLon = Math.max(0.001, (maxLon - minLon) * 0.1);
    map.fitBounds(
      [[minLon - dLon, minLat - dLat], [maxLon + dLon, maxLat + dLat]],
      { padding: 80, duration: 1200, maxZoom: 14 },
    );
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
    if (!currentPoint || imageryMatches.length === 0) return;
    const pt = turf.point([currentPoint.lon, currentPoint.lat]);
    let closest = null;
    let minDistance = Infinity;
    for (const match of imageryMatches) {
      if (match.imageLon && match.imageLat) {
        const matchPt = turf.point([match.imageLon, match.imageLat]);
        const dist = turf.distance(pt, matchPt, { units: "meters" });
        if (dist < 100 && dist < minDistance) {
          minDistance = dist;
          closest = match;
        }
      }
    }
    setActiveMatch(closest);
  }, [mode, currentPoint, imageryMatches]);

  // Reset playback when switching modes
  useEffect(() => {
    setCurrentTimeIndex(0);
    setIsPlaying(false);
    setActiveMatch(null);
    setPlacing(false);
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
    <div className="flex h-screen w-full bg-background overflow-hidden dark text-foreground">
      {/* Sidebar */}
      <div className="w-80 border-r border-border bg-sidebar/90 backdrop-blur-md flex flex-col z-10 shadow-xl">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl tracking-widest font-mono font-bold text-primary mb-1 uppercase">AnimalView</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            {mode === "sim" ? "Synthetic paths" : "Reconstructing paths"}
          </p>
          {/* Mode toggle */}
          <div className="mt-4 grid grid-cols-2 gap-1 p-1 bg-background/40 border border-border rounded-sm">
            {(["real", "sim"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`text-[10px] font-mono uppercase tracking-widest py-2 rounded-sm transition-all ${
                  mode === m
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "real" ? "Real Tracks" : "Simulation"}
              </button>
            ))}
          </div>
          {providersReq.data?.demoMode && mode === "real" && (
            <div className="mt-4 px-3 py-2 bg-primary/10 border border-primary/20 rounded-sm">
              <p className="text-[10px] text-primary uppercase font-mono tracking-wider">Demo Mode Active</p>
              <p className="text-[10px] text-muted-foreground mt-1">Using simulated bear track around Banff</p>
            </div>
          )}
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {mode === "real" ? (
            <>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Species</Label>
                <Select value={speciesId} onValueChange={setSpeciesId}>
                  <SelectTrigger className="bg-background/50 border-border font-mono text-sm">
                    <SelectValue placeholder="Select species..." />
                  </SelectTrigger>
                  <SelectContent className="dark">
                    {speciesReq.data?.species?.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="font-mono text-sm">
                        {s.commonName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Study</Label>
                <Select value={studyId} onValueChange={setStudyId} disabled={!speciesId}>
                  <SelectTrigger className="bg-background/50 border-border font-mono text-sm">
                    <SelectValue placeholder="Select study..." />
                  </SelectTrigger>
                  <SelectContent className="dark">
                    {studiesReq.data?.studies?.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="font-mono text-sm">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Individual</Label>
                <Select value={individualId} onValueChange={setIndividualId} disabled={!studyId}>
                  <SelectTrigger className="bg-background/50 border-border font-mono text-sm">
                    <SelectValue placeholder="Select individual..." />
                  </SelectTrigger>
                  <SelectContent className="dark">
                    {individualsReq.data?.individuals?.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="font-mono text-sm">
                        {s.name} {s.nickname ? `"${s.nickname}"` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 pt-4 border-t border-border">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex justify-between">
                  <span>Search Radius</span>
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
                  <span>Human Pressure</span>
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
                  Overlay roads, buildings &amp; industrial sites from OpenStreetMap.
                </p>
              </div>

              <div className="pt-6 space-y-3">
                <Button
                  onClick={handleLoadTrack}
                  disabled={!individualId}
                  className="w-full font-mono uppercase tracking-widest text-xs h-10"
                  variant="outline"
                >
                  Load Track
                </Button>
                <Button
                  onClick={handleFindImagery}
                  disabled={!trackReq.data?.points || matchImageryMutation.isPending}
                  className="w-full font-mono uppercase tracking-widest text-xs h-10 bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all"
                >
                  {matchImageryMutation.isPending ? "Searching..." : "Find Context Imagery"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Species</Label>
                <Select value={simSpeciesId} onValueChange={setSimSpeciesId}>
                  <SelectTrigger className="bg-background/50 border-border font-mono text-sm">
                    <SelectValue placeholder="Select species..." />
                  </SelectTrigger>
                  <SelectContent className="dark">
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
                  <span>Duration</span>
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
                  <span>1 week</span>
                  <span>1 month</span>
                </div>
              </div>

              <div className="pt-4 border-t border-border space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Start Location</Label>
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
                    {placing ? "Click on map…" : simStart ? "Re-place individual" : "Place individual"}
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
                  {simulateMutation.isPending ? "Simulating…" : "Generate Track"}
                </Button>
                {simResult && (
                  <div className="text-[10px] font-mono text-muted-foreground space-y-1 pt-2 border-t border-border">
                    <div className="flex justify-between">
                      <span>Points</span>
                      <span className="text-primary">{simResult.points.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>OSM barriers</span>
                      <span className="text-primary">{simResult.barriers.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ID</span>
                      <span>{simResult.individualId}</span>
                    </div>
                    {simResult.warnings.map((w, i) => (
                      <p key={i} className="text-amber-400/70 pt-1">⚠ {w}</p>
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
              These are <span className="text-amber-400/90">simulated plausible movements</span>, not observed animal locations. Generated via biased random walk over a habitat gradient and live OpenStreetMap barriers.
            </p>
          ) : (
            <p>
              AnimalView reconstructs possible visual encounters along animal movement tracks. This is not proof of what the animal saw — it is a spatial approximation using public street-level imagery near recorded GPS points.
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
          {showHumanPressure && mode === "real" && (
            <Source
              id="human-pressure"
              type="raster"
              tiles={[
                "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
                "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
                "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
                "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
              ]}
              tileSize={256}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
            >
              <Layer
                id="human-pressure-layer"
                type="raster"
                paint={{
                  "raster-opacity": 0.45,
                  "raster-contrast": 0.3,
                  "raster-saturation": -0.6,
                }}
              />
            </Source>
          )}

          {trackGeojson && (
            <Source id="track" type="geojson" data={trackGeojson as any}>
              <Layer
                id="track-line"
                type="line"
                paint={{
                  "line-color": trackLineColor,
                  "line-width": 2,
                  "line-opacity": mode === "sim" ? 0.85 : 0.4,
                  "line-blur": mode === "sim" ? 0 : 1,
                  "line-dasharray": mode === "sim" ? [2, 1.5] : [1, 0],
                }}
              />
            </Source>
          )}

          {/* Simulation barriers */}
          {mode === "sim" &&
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
                        activeMatch?.imageId === match.imageId
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
              Simulated plausible movements · not observed animal locations
            </span>
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-amber-400/40 hover:bg-amber-400/20 transition-colors"
                  aria-label="About this simulation"
                >
                  <Info className="w-3 h-3" />
                  About
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-mono uppercase tracking-widest text-primary">
                    TaxonPath — Simulation Method
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm text-muted-foreground leading-relaxed font-mono">
                  <p>
                    TaxonPath generates <span className="text-foreground">plausible</span> animal
                    trajectories — not predictions, not observations. The goal is to illustrate
                    how a given species <span className="text-foreground">might</span> move
                    through a landscape given its ecology and the real human barriers around it.
                  </p>

                  <div>
                    <h3 className="text-foreground text-xs uppercase tracking-widest mb-2">
                      1 · Species profiles
                    </h3>
                    <p>
                      Five hand-tuned profiles (red fox, roe deer, Hermann's tortoise, wild boar,
                      grey wolf). Each profile encodes step length, max daily distance, barrier
                      sensitivity, and an exploration level — calibrated from published home-range
                      and dispersal literature.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-foreground text-xs uppercase tracking-widest mb-2">
                      2 · Habitat suitability
                    </h3>
                    <p>
                      A continuous, deterministic procedural field (smooth sin/cos gradient
                      seeded on coordinates) acts as a proxy for habitat quality in the absence
                      of a global land-cover layer. Values range 0–1 and bias the walk toward
                      high-suitability pixels.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-foreground text-xs uppercase tracking-widest mb-2">
                      3 · Real-world barriers (OpenStreetMap)
                    </h3>
                    <p>
                      For each run we query the live Overpass API around the start point and
                      pull three feature classes: <span className="text-red-400">major roads</span>,{" "}
                      <span className="text-blue-400">rivers & water bodies</span>, and{" "}
                      <span className="text-amber-400">urban / built-up land use</span>. Results
                      are cached 30 min in memory. Each candidate step is penalized by proximity
                      to nearby barriers, weighted by the species' sensitivity.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-foreground text-xs uppercase tracking-widest mb-2">
                      4 · Biased correlated random walk
                    </h3>
                    <p>
                      At every step the simulator draws 8 candidate moves around the current
                      heading. Each candidate is scored by:
                    </p>
                    <pre className="text-[11px] bg-background/60 border border-border rounded-sm p-3 my-2 text-foreground overflow-x-auto">
{`score = w_habitat · habitat(p)
      − w_barrier · barrierRisk(p)
      − w_turn    · |Δheading|
      + w_explore · noise`}
                    </pre>
                    <p>
                      One of the top candidates is selected (slightly stochastic). Weights come
                      from the species profile, so a wolf cruises in long correlated bouts while
                      a tortoise tumbles in tight loops. The PRNG is seeded (mulberry32) so the
                      same inputs always reproduce the same track.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-foreground text-xs uppercase tracking-widest mb-2">
                      5 · Timing
                    </h3>
                    <p>
                      Step count is capped by the species' max daily distance and by simulation
                      duration (max 400 points). Timestamps are spaced evenly across the
                      requested window.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <h3 className="text-amber-300 text-xs uppercase tracking-widest mb-2">
                      Limits & honest caveats
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>The habitat field is procedural, not real land-cover.</li>
                      <li>OSM barriers are crowd-sourced; rural areas may be sparse.</li>
                      <li>No weather, no season, no inter-individual behaviour.</li>
                      <li>
                        Output is illustrative — never use it as evidence of where a real animal
                        went.
                      </li>
                    </ul>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Basemap toggle */}
        <div className="absolute top-4 right-4 flex bg-background/85 backdrop-blur-md border border-border rounded-sm overflow-hidden shadow-lg">
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
              {b}
            </button>
          ))}
        </div>

        {/* Placement hint */}
        {mode === "sim" && placing && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-primary/15 border border-primary/40 backdrop-blur-md rounded-sm text-[10px] font-mono uppercase tracking-widest text-primary pointer-events-none">
            Click anywhere on the map to drop the individual
          </div>
        )}

        {/* Bottom Player */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pointer-events-none flex justify-center">
          <Card className="pointer-events-auto bg-background/90 backdrop-blur-xl border-border w-full max-w-3xl flex items-center p-4 gap-6 shadow-2xl">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full" onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
              </Button>
              <div className="flex flex-col ml-2">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Speed</span>
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
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-80 border-l border-border bg-sidebar/95 backdrop-blur-md flex flex-col z-10 relative shadow-[-10px_0_30px_rgba(0,0,0,0.5)] transition-all duration-500">
        <div className="p-6 border-b border-border flex items-center gap-2 text-primary">
          <Info className="w-4 h-4" />
          <h2 className="text-xs uppercase tracking-widest font-mono font-bold">
            {mode === "sim" ? "Ecology Readout" : "Candidate Context"}
          </h2>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {mode === "sim" ? (
            currentPoint && simResult ? (
              <div className="space-y-4 font-mono text-[11px] text-muted-foreground/80">
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="uppercase tracking-widest text-muted-foreground">Habitat score</span>
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
                    <span className="uppercase tracking-widest text-muted-foreground">Barrier risk</span>
                    <span className="text-red-300">{(currentPoint.barrierRisk ?? 0).toFixed(2)}</span>
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
                    Step {currentTimeIndex + 1} of {simResult.points.length}. Habitat is derived from a procedural suitability gradient; barrier risk uses live OpenStreetMap roads, water and built-up areas near the start point.
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                <div className="w-12 h-12 border border-dashed border-muted-foreground/30 rounded-full flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground max-w-[200px]">
                  {simStart ? "Generate a track to see ecology" : "Place an individual on the map to begin"}
                </p>
              </div>
            )
          ) : activeMatch ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="relative aspect-video rounded-sm overflow-hidden border border-border bg-black">
                {activeMatch.previewUrl ? (
                  <img
                    src={activeMatch.previewUrl}
                    alt="Candidate context"
                    className="object-cover w-full h-full opacity-80 mix-blend-screen grayscale-[20%] contrast-125"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-xs">
                    No Image Preview
                  </div>
                )}
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" />
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-sm border border-white/10 text-[9px] font-mono uppercase text-white/80 tracking-widest">
                  {activeMatch.provider}
                </div>
              </div>

              <div className="space-y-3 font-mono text-[11px] text-muted-foreground/80">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="uppercase tracking-widest text-muted-foreground">Confidence</span>
                  <span className={activeMatch.confidence === "high" ? "text-primary" : ""}>
                    {activeMatch.confidence}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="uppercase tracking-widest text-muted-foreground">Distance</span>
                  <span>{Math.round(activeMatch.distanceM)} meters</span>
                </div>
                {activeMatch.imageDate && (
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="uppercase tracking-widest text-muted-foreground">Image Date</span>
                    <span>{activeMatch.imageDate}</span>
                  </div>
                )}
              </div>

              <div className="p-4 bg-muted/30 border border-border/50 rounded-sm mt-8">
                <p className="text-[10px] font-mono leading-relaxed text-muted-foreground">
                  Potential image near the track. This is nearby street-level imagery within {Math.round(activeMatch.distanceM)} meters, not the exact animal view.
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <div className="w-12 h-12 border border-dashed border-muted-foreground/30 rounded-full flex items-center justify-center">
                <div className="w-1 h-1 bg-muted-foreground rounded-full animate-pulse" />
              </div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground max-w-[200px]">
                {trackReq.data?.points ? "Play track to scan for nearby visual context" : "Load a track to begin"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
