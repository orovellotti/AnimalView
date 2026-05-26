import { useState, useMemo, useEffect, useRef } from "react";
import Map, { Source, Layer, Marker } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
  useGetProviders
} from "@workspace/api-client-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Play, Pause, FastForward, Rewind, Info } from "lucide-react";

export default function Home() {
  const [speciesId, setSpeciesId] = useState<string>("");
  const [studyId, setStudyId] = useState<string>("");
  const [individualId, setIndividualId] = useState<string>("");
  const [radius, setRadius] = useState<number>(50);

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
    { query: { enabled: isTracking, queryKey: getGetTrackQueryKey({ studyId, individualId }) } }
  );

  const matchImageryMutation = useMatchImagery();
  const [imageryMatches, setImageryMatches] = useState<any[]>([]);
  const [activeMatch, setActiveMatch] = useState<any | null>(null);

  const handleLoadTrack = () => {
    setIsTracking(true);
    setCurrentTimeIndex(0);
    setActiveMatch(null);
  };

  // Auto-select the real wolf (Boutin Alberta study, Wolf 13791) on first load.
  const didAutoSelectRef = useRef(false);
  useEffect(() => {
    if (didAutoSelectRef.current) return;
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
  }, [speciesReq.data, speciesId, studyId, individualId]);

  const didAutoStudyRef = useRef(false);
  useEffect(() => {
    if (didAutoStudyRef.current) return;
    if (speciesId !== "wolf") return;
    const boutin = studiesReq.data?.studies?.find(
      (s) => s.id === "boutin-alberta-wolf",
    );
    if (boutin && !studyId) {
      setStudyId("boutin-alberta-wolf");
      didAutoStudyRef.current = true;
    }
  }, [speciesId, studiesReq.data, studyId]);

  const didAutoIndividualRef = useRef(false);
  useEffect(() => {
    if (didAutoIndividualRef.current) return;
    if (studyId !== "boutin-alberta-wolf") return;
    const wolfInd = individualsReq.data?.individuals?.find(
      (i) => i.id === "13791",
    );
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
          providers: ["google", "mapillary"]
        }
      });
      setImageryMatches(res.matches || []);
    } catch (e) {
      console.error("Imagery error:", e);
    }
  };

  const trackGeojson = useMemo(() => {
    if (!trackReq.data?.points || trackReq.data.points.length === 0) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: trackReq.data.points.map(p => [p.lon, p.lat])
      }
    };
  }, [trackReq.data]);

  const currentPoint = trackReq.data?.points?.[currentTimeIndex];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && trackReq.data?.points) {
      interval = setInterval(() => {
        setCurrentTimeIndex((prev) => {
          if (prev >= (trackReq.data?.points.length || 0) - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / speed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, speed, trackReq.data]);

  useEffect(() => {
    if (!currentPoint || imageryMatches.length === 0) return;
    
    // Find closest match to current point
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
  }, [currentPoint, imageryMatches]);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden dark text-foreground">
      {/* Sidebar */}
      <div className="w-80 border-r border-border bg-sidebar/90 backdrop-blur-md flex flex-col z-10 shadow-xl">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl tracking-widest font-mono font-bold text-primary mb-1 uppercase">AnimalView</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Reconstructing paths</p>
          {providersReq.data?.demoMode && (
            <div className="mt-4 px-3 py-2 bg-primary/10 border border-primary/20 rounded-sm">
              <p className="text-[10px] text-primary uppercase font-mono tracking-wider">Demo Mode Active</p>
              <p className="text-[10px] text-muted-foreground mt-1">Using simulated bear track around Banff</p>
            </div>
          )}
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
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
              min={10}
              max={200}
              step={10}
              onValueChange={([val]) => setRadius(val)}
              className="py-2"
            />
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
        </div>

        <div className="p-6 border-t border-border text-[10px] text-muted-foreground/60 leading-relaxed font-mono">
          <p>AnimalView reconstructs possible visual encounters along animal movement tracks. This is not proof of what the animal saw — it is a spatial approximation using public street-level imagery near recorded GPS points.</p>
        </div>
      </div>

      {/* Main Map */}
      <div className="flex-1 relative">
        <Map
          initialViewState={{
            longitude: -115.5,
            latitude: 51.1,
            zoom: 10
          }}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          maplibregl={maplibregl as any}
        >
          {trackGeojson && (
            <Source id="track" type="geojson" data={trackGeojson as any}>
              <Layer
                id="track-line"
                type="line"
                paint={{
                  "line-color": "hsl(40, 90%, 55%)",
                  "line-width": 2,
                  "line-opacity": 0.4,
                  "line-blur": 1
                }}
              />
            </Source>
          )}

          {imageryMatches.map((match, i) => (
            match.imageLon && match.imageLat && (
              <Marker key={`match-${i}`} longitude={match.imageLon} latitude={match.imageLat}>
                <div className={`w-2 h-2 rounded-full ${match.provider === 'google' ? 'bg-blue-500' : 'bg-green-500'} ${activeMatch?.imageId === match.imageId ? 'ring-4 ring-primary/50 bg-primary shadow-[0_0_15px_rgba(234,179,8,0.8)]' : 'opacity-40'}`} />
              </Marker>
            )
          ))}

          {currentPoint && (
            <Marker longitude={currentPoint.lon} latitude={currentPoint.lat}>
              <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shadow-[0_0_20px_rgba(234,179,8,1)] animate-pulse">
                <div className="w-1.5 h-1.5 rounded-full bg-black" />
              </div>
            </Marker>
          )}
        </Map>

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
                  {[1, 5, 20, 100].map(s => (
                    <button 
                      key={s} 
                      onClick={() => setSpeed(s)}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${speed === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-2">
              <div className="flex justify-between font-mono text-[10px] uppercase text-muted-foreground tracking-widest">
                <span>{currentPoint ? new Date(currentPoint.timestamp).toLocaleString() : '---'}</span>
                <span>{currentPoint ? `${currentPoint.lat.toFixed(5)}, ${currentPoint.lon.toFixed(5)}` : '---'}</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden relative">
                <div 
                  className="absolute top-0 bottom-0 left-0 bg-primary transition-all duration-200" 
                  style={{ width: `${trackReq.data?.points?.length ? (currentTimeIndex / trackReq.data.points.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Right Image Panel */}
      <div className="w-80 border-l border-border bg-sidebar/95 backdrop-blur-md flex flex-col z-10 relative shadow-[-10px_0_30px_rgba(0,0,0,0.5)] transition-all duration-500">
        <div className="p-6 border-b border-border flex items-center gap-2 text-primary">
          <Info className="w-4 h-4" />
          <h2 className="text-xs uppercase tracking-widest font-mono font-bold">Candidate Context</h2>
        </div>
        
        <div className="flex-1 p-6 overflow-y-auto">
          {activeMatch ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="relative aspect-video rounded-sm overflow-hidden border border-border bg-black">
                {activeMatch.previewUrl ? (
                  <img src={activeMatch.previewUrl} alt="Candidate context" className="object-cover w-full h-full opacity-80 mix-blend-screen grayscale-[20%] contrast-125" />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-xs">No Image Preview</div>
                )}
                
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" />
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-sm border border-white/10 text-[9px] font-mono uppercase text-white/80 tracking-widest">
                  {activeMatch.provider}
                </div>
              </div>

              <div className="space-y-3 font-mono text-[11px] text-muted-foreground/80">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="uppercase tracking-widest text-muted-foreground">Confidence</span>
                  <span className={activeMatch.confidence === 'high' ? 'text-primary' : ''}>{activeMatch.confidence}</span>
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
