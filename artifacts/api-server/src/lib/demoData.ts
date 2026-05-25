type TrackPoint = { lat: number; lon: number; timestamp: string };

type DemoCenter = {
  studyId: string;
  individualId: string;
  name: string;
  center: [number, number];
  spread: number;
};

const DEMO_CENTERS: Record<string, DemoCenter> = {
  "demo-grizzly-banff/bear-71": {
    studyId: "demo-grizzly-banff",
    individualId: "bear-71",
    name: "Bear 71",
    center: [51.4968, -115.9281],
    spread: 0.08,
  },
  "demo-grizzly-banff/bear-148": {
    studyId: "demo-grizzly-banff",
    individualId: "bear-148",
    name: "Bear 148",
    center: [51.178, -115.5708],
    spread: 0.06,
  },
  "demo-caribou-jasper/caribou-a4": {
    studyId: "demo-caribou-jasper",
    individualId: "caribou-a4",
    name: "Caribou A4",
    center: [52.8737, -118.0814],
    spread: 0.1,
  },
  "demo-wolf-calanques/wolf-c2": {
    studyId: "demo-wolf-calanques",
    individualId: "wolf-c2",
    name: "Wolf C2",
    center: [43.2148, 5.4419],
    spread: 0.04,
  },
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function generateDemoTrack(
  studyId: string,
  individualId: string,
  count = 80,
): TrackPoint[] {
  const key = `${studyId}/${individualId}`;
  const cfg =
    DEMO_CENTERS[key] ??
    DEMO_CENTERS["demo-grizzly-banff/bear-71"]!;
  const rand = seededRandom(
    key.split("").reduce((a, c) => a + c.charCodeAt(0), 17),
  );

  const points: TrackPoint[] = [];
  let lat = cfg.center[0];
  let lon = cfg.center[1];
  const start = new Date("2024-06-15T06:00:00Z").getTime();
  // Random walk biased to form a loose loop
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const angle = t * Math.PI * 2 + rand() * 0.6;
    const r = cfg.spread * (0.4 + 0.6 * Math.sin(t * Math.PI));
    lat = cfg.center[0] + Math.sin(angle) * r + (rand() - 0.5) * 0.004;
    lon = cfg.center[1] + Math.cos(angle) * r + (rand() - 0.5) * 0.004;
    points.push({
      lat,
      lon,
      timestamp: new Date(start + i * 30 * 60 * 1000).toISOString(),
    });
  }
  return points;
}

export const DEMO_SPECIES = [
  {
    id: "grizzly",
    commonName: "Grizzly Bear",
    scientificName: "Ursus arctos horribilis",
    habitat: "Rocky Mountain corridors, Banff & Jasper",
  },
  {
    id: "caribou",
    commonName: "Woodland Caribou",
    scientificName: "Rangifer tarandus caribou",
    habitat: "Subalpine boreal, Jasper",
  },
  {
    id: "wolf",
    commonName: "Grey Wolf",
    scientificName: "Canis lupus",
    habitat: "Mediterranean garrigue, Calanques",
  },
];

export const DEMO_STUDIES: Record<
  string,
  { id: string; name: string; principalInvestigator?: string; location?: string }[]
> = {
  grizzly: [
    {
      id: "demo-grizzly-banff",
      name: "Banff Grizzly Movement Study",
      principalInvestigator: "Parks Canada (demo)",
      location: "Banff National Park, Alberta",
    },
  ],
  caribou: [
    {
      id: "demo-caribou-jasper",
      name: "Jasper Caribou Recovery Study",
      principalInvestigator: "Jasper Wildlife (demo)",
      location: "Jasper National Park, Alberta",
    },
  ],
  wolf: [
    {
      id: "demo-wolf-calanques",
      name: "Calanques Wolf Return Study",
      principalInvestigator: "Parc National des Calanques (demo)",
      location: "Marseille, France",
    },
  ],
};

export const DEMO_INDIVIDUALS: Record<
  string,
  { id: string; name: string; sex?: string; nickname?: string }[]
> = {
  "demo-grizzly-banff": [
    { id: "bear-71", name: "GF-071", sex: "F", nickname: "Bear 71" },
    { id: "bear-148", name: "GF-148", sex: "F", nickname: "Bear 148" },
  ],
  "demo-caribou-jasper": [
    { id: "caribou-a4", name: "WC-A4", sex: "M", nickname: "Caribou A4" },
  ],
  "demo-wolf-calanques": [
    { id: "wolf-c2", name: "GW-C2", sex: "M", nickname: "Wolf C2" },
  ],
};
