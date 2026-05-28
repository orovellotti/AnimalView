import { haversineMeters } from "./geo";
import { fetchBarriersNear, type BarrierFeature } from "./osmBarriers";
import { getSimSpecies } from "./simSpecies";

export interface SimPoint {
  lat: number;
  lon: number;
  timestamp: string;
  habitatScore: number;
  barrierRisk: number;
}

export interface SimulateInput {
  speciesId: string;
  startLat: number;
  startLon: number;
  durationHours: number;
  explorationOverride?: number;
  seed?: number;
}

export interface SimulateOutput {
  speciesId: string;
  individualId: string;
  points: SimPoint[];
  barriers: BarrierFeature[];
  warnings: string[];
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function offsetMeters(
  lat: number,
  lon: number,
  dxMeters: number,
  dyMeters: number,
): { lat: number; lon: number } {
  const dLat = dyMeters / 111320;
  const dLon = dxMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lon: lon + dLon };
}

function habitatScoreAt(
  lat: number,
  lon: number,
  seed: number,
  preferred: number,
): number {
  const k1 = 0.012;
  const k2 = 0.07;
  const s = seed * 0.0001;
  const a = Math.sin((lat + s) * 100 * k1) * Math.cos((lon - s) * 100 * k1);
  const b = Math.sin((lat * 100 + lon * 100) * k2 + seed);
  const c = Math.cos((lat - lon) * 100 * 0.03 + seed * 0.5);
  const raw = 0.5 + 0.25 * a + 0.15 * b + 0.1 * c;
  return Math.max(0, Math.min(1, raw * 0.7 + preferred * 0.3));
}

function nearestBarrierDist(
  lat: number,
  lon: number,
  barriers: BarrierFeature[],
): { dist: number; kind: BarrierFeature["kind"] | null } {
  let best = Infinity;
  let kind: BarrierFeature["kind"] | null = null;
  for (const b of barriers) {
    const d = haversineMeters({ lat, lon }, b);
    if (d < best) {
      best = d;
      kind = b.kind;
    }
  }
  return { dist: best, kind };
}

function barrierRiskAt(
  lat: number,
  lon: number,
  barriers: BarrierFeature[],
  sensitivity: number,
): number {
  if (barriers.length === 0) return 0;
  const { dist, kind } = nearestBarrierDist(lat, lon, barriers);
  if (!Number.isFinite(dist) || !kind) return 0;
  // wider influence radius — humans (roads & urban) repel animals from far away
  const scale = kind === "highway" ? 500 : kind === "water" ? 120 : 450;
  const proximity = Math.exp(-dist / scale);
  return Math.min(1, proximity * sensitivity * 1.4);
}

export async function simulateTrack(
  input: SimulateInput,
): Promise<SimulateOutput> {
  const species = getSimSpecies(input.speciesId);
  if (!species) throw new Error(`Unknown species: ${input.speciesId}`);
  const warnings: string[] = [];
  const seed = input.seed ?? Math.floor(Math.random() * 1e9);
  const rand = mulberry32(seed);
  const explore =
    input.explorationOverride ?? species.explorationLevel;

  const maxStepsByDistance = Math.max(
    1,
    Math.floor(
      (species.maxDailyKm * 1000 * (input.durationHours / 24)) /
        species.stepMeters,
    ),
  );
  const stepsByHour = Math.max(2, Math.floor(input.durationHours * 2));
  const totalSteps = Math.max(
    2,
    Math.min(maxStepsByDistance, stepsByHour, 400),
  );

  const barrierRadius = Math.max(3000, species.maxDailyKm * 1000);
  let barriers: BarrierFeature[] = [];
  try {
    barriers = await fetchBarriersNear(
      input.startLat,
      input.startLon,
      barrierRadius,
    );
  } catch {
    warnings.push("Could not fetch live OSM barriers; using habitat only.");
  }
  if (barriers.length === 0) {
    warnings.push("No OSM barriers found in this area.");
  }

  const startTime = Date.now();
  const dtMs = (input.durationHours * 3600 * 1000) / totalSteps;
  const preferredBaseline = 0.6;

  const points: SimPoint[] = [];
  let lat = input.startLat;
  let lon = input.startLon;
  let heading = rand() * Math.PI * 2;

  const startHabitat = habitatScoreAt(lat, lon, seed, preferredBaseline);
  const startBarrier = barrierRiskAt(lat, lon, barriers, species.barrierSensitivity);
  points.push({
    lat,
    lon,
    timestamp: new Date(startTime).toISOString(),
    habitatScore: startHabitat,
    barrierRisk: startBarrier,
  });

  for (let step = 1; step <= totalSteps; step++) {
    const candidates: {
      lat: number;
      lon: number;
      score: number;
      hab: number;
      risk: number;
      bearing: number;
    }[] = [];
    const numCandidates = 8;
    for (let i = 0; i < numCandidates; i++) {
      const driftFromHeading = (rand() - 0.5) * Math.PI * (0.5 + explore);
      const bearing = heading + driftFromHeading;
      const distance = species.stepMeters * (0.6 + rand() * 0.8);
      const dx = Math.sin(bearing) * distance;
      const dy = Math.cos(bearing) * distance;
      const next = offsetMeters(lat, lon, dx, dy);
      const hab = habitatScoreAt(next.lat, next.lon, seed, preferredBaseline);
      const risk = barrierRiskAt(
        next.lat,
        next.lon,
        barriers,
        species.barrierSensitivity,
      );
      const score = hab - risk * 2.2 + (rand() - 0.5) * explore * 0.4;
      candidates.push({ ...next, score, hab, risk, bearing });
    }
    candidates.sort((a, b) => b.score - a.score);
    const pickIdx = rand() < explore * 0.5 ? Math.floor(rand() * candidates.length) : 0;
    const picked = candidates[pickIdx]!;
    lat = picked.lat;
    lon = picked.lon;
    heading = picked.bearing;
    points.push({
      lat,
      lon,
      timestamp: new Date(startTime + step * dtMs).toISOString(),
      habitatScore: picked.hab,
      barrierRisk: picked.risk,
    });
  }

  return {
    speciesId: species.id,
    individualId: `synthetic_${seed.toString(36).slice(-6)}`,
    points,
    barriers,
    warnings,
  };
}
