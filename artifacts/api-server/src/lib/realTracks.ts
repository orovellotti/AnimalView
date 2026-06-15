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

const CATALOGS: Record<
  string,
  { name: string; file: string; individualPrefix?: string }
> = {
  "boutin-alberta-wolf": {
    name: "Boutin Alberta Grey Wolf",
    file: "boutin_alberta_wolf.csv",
    individualPrefix: "Wolf",
  },
  "slavc-dispersal": {
    name: "Slavc Dispersal (approx.)",
    file: "slavc_dispersal.csv",
    individualPrefix: "Wolf",
  },
  "alcotra-lemed-ibex": {
    name: "ALCOTRA LEMED-IBEX — Capra ibex (Western Alps)",
    file: "alexandre_pne_ibex.csv",
    individualPrefix: "Ibex",
  },
  "nki-elephant": {
    name: "Elephant Research — Nki National Park (Cameroon)",
    file: "nki_elephant_40480.csv",
    individualPrefix: "Collar",
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
  citation?: string;
  url?: string;
}[] {
  if (species === "wolf") {
    return [
      {
        id: "slavc-dispersal",
        name: "Slavc Dispersal (approx.)",
        principalInvestigator: "SLOWOLF / LIFE WOLFALPS (reconstructed)",
        location: "Slovenia → Lessinia, Italian Alps",
        citation:
          "Approximate reconstruction. Source: SloWolf project, University of Ljubljana — documented long-distance dispersal of wolf “Slavc” (Dinaric population → Lessinia), 2011–2012.",
        url: "https://www.volkovi.si/?lang=en",
      },
      {
        id: "boutin-alberta-wolf",
        name: "Boutin Alberta Grey Wolf",
        principalInvestigator: "Stan Boutin (U. Alberta)",
        location: "Northeastern Alberta, Canada",
        citation:
          "Boutin, S. “ABoVE: Boutin Alberta Grey Wolf”, Department of Biological Sciences, University of Alberta. Accessed via Movebank.org (study 492444603).",
        url: "https://www.movebank.org/cms/webapp?gwt_fragment=page=studies,path=study492444603",
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
        citation:
          "Parc national des Écrins. “Monitoring of Capra ibex populations in the western Alps” (programme ALCOTRA LEMED-IBEX). Accessed via Movebank.org.",
        url: "https://www.areeprotettealpimarittime.it/attivita/progetti-europei/alcotra-lemed-ibex",
      },
    ];
  }
  if (species === "elephant") {
    return [
      {
        id: "nki-elephant",
        name: "Elephant Research — Nki National Park (Cameroon)",
        location: "Nki National Park, Cameroon",
        citation:
          "Blake, S., Douglas-Hamilton, I. & Karesh, W. B. (2001). GPS telemetry of forest elephants in Central Africa: results of a preliminary study. African Journal of Ecology 39:178–186. Dataset: “Elephant Research — Nki National Park (Cameroon)”, accessed via Movebank.org.",
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
  const prefix = CATALOGS[studyId]?.individualPrefix;
  return Array.from(cat.individuals.keys())
    .sort()
    .map((id) => ({
      id,
      name: prefix && /^\d+$/.test(id) ? `${prefix} ${id}` : id,
    }));
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
