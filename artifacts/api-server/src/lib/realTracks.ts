import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export type TrackPoint = { lat: number; lon: number; timestamp: string };

type Catalog = {
  studyId: string;
  studyName: string;
  csvPath: string;
  individuals: Map<string, TrackPoint[]>;
};

function resolveDataDir(): string {
  const candidates = [
    resolve(process.cwd(), "data"),
    resolve(process.cwd(), "artifacts/api-server/data"),
    resolve(import.meta.dirname, "..", "data"),
    resolve(import.meta.dirname, "..", "..", "data"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

const DATA_DIR = resolveDataDir();

const CATALOGS: Record<string, { name: string; file: string }> = {
  "boutin-alberta-wolf": {
    name: "Boutin Alberta Grey Wolf",
    file: "boutin_alberta_wolf.csv",
  },
  "slavc-dispersal": {
    name: "Slavc Dispersal (approx.)",
    file: "slavc_dispersal.csv",
  },
  "alcotra-lemed-ibex": {
    name: "ALCOTRA LEMED-IBEX — Capra ibex (Western Alps)",
    file: "alexandre_pne_ibex.csv",
  },
};

let loadedCatalogs: Map<string, Catalog> | null = null;

function stripQuotes(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function loadCatalog(studyId: string): Catalog | null {
  const meta = CATALOGS[studyId];
  if (!meta) return null;
  const csvPath = join(DATA_DIR, meta.file);
  if (!existsSync(csvPath)) return null;
  const text = readFileSync(csvPath, "utf-8");
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return null;
  const header = parseCsvRow(lines[0]!).map(stripQuotes);
  const iLat = header.indexOf("location-lat");
  const iLon = header.indexOf("location-long");
  const iTs = header.indexOf("timestamp");
  const iInd = header.indexOf("individual-local-identifier");
  if (iLat < 0 || iLon < 0 || iTs < 0 || iInd < 0) return null;
  const individuals = new Map<string, TrackPoint[]>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = parseCsvRow(line);
    const lat = Number(cols[iLat]);
    const lon = Number(cols[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const id = stripQuotes(cols[iInd] ?? "");
    if (!id) continue;
    const ts = stripQuotes(cols[iTs] ?? "");
    let arr = individuals.get(id);
    if (!arr) {
      arr = [];
      individuals.set(id, arr);
    }
    arr.push({ lat, lon, timestamp: ts });
  }
  for (const arr of individuals.values()) {
    arr.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  return { studyId, studyName: meta.name, csvPath, individuals };
}

function ensureLoaded(): Map<string, Catalog> {
  if (loadedCatalogs) return loadedCatalogs;
  const map = new Map<string, Catalog>();
  for (const id of Object.keys(CATALOGS)) {
    const cat = loadCatalog(id);
    if (cat) map.set(id, cat);
  }
  loadedCatalogs = map;
  return map;
}

export function isRealStudy(studyId: string): boolean {
  return studyId in CATALOGS;
}

export function listRealStudies(species: string): {
  id: string;
  name: string;
  principalInvestigator?: string;
  location?: string;
}[] {
  if (species === "wolf") {
    return [
      {
        id: "slavc-dispersal",
        name: "Slavc Dispersal (approx.)",
        principalInvestigator: "SLOWOLF / LIFE WOLFALPS (reconstructed)",
        location: "Slovenia → Lessinia, Italian Alps",
      },
      {
        id: "boutin-alberta-wolf",
        name: "Boutin Alberta Grey Wolf",
        principalInvestigator: "Stan Boutin (U. Alberta)",
        location: "Northeastern Alberta, Canada",
      },
    ];
  }
  if (species === "ibex") {
    return [
      {
        id: "alcotra-lemed-ibex",
        name: "ALCOTRA LEMED-IBEX — Capra ibex",
        principalInvestigator: "Parc national des Écrins (project ALCOTRA LEMED-IBEX)",
        location: "Western Alps, France",
      },
    ];
  }
  return [];
}

export function listRealIndividuals(
  studyId: string,
): { id: string; name: string }[] {
  const cat = ensureLoaded().get(studyId);
  if (!cat) return [];
  return Array.from(cat.individuals.keys())
    .sort()
    .map((id) => ({ id, name: /^\d+$/.test(id) ? `Wolf ${id}` : id }));
}

export function getRealTrack(
  studyId: string,
  individualId: string,
  maxPoints = 800,
): TrackPoint[] | null {
  const cat = ensureLoaded().get(studyId);
  if (!cat) return null;
  const pts = cat.individuals.get(individualId);
  if (!pts || pts.length === 0) return null;
  if (pts.length <= maxPoints) return pts;
  const step = pts.length / maxPoints;
  const out: TrackPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(pts[Math.floor(i * step)]!);
  }
  const last = pts[pts.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
