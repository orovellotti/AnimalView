export interface SimSpeciesProfile {
  id: string;
  commonName: string;
  scientificName: string;
  summary: string;
  stepMeters: number;
  maxDailyKm: number;
  explorationLevel: number;
  barrierSensitivity: number;
  preferredHabitats: string[];
  avoidedHabitats: string[];
  nocturnal: number;
}

export const SIM_SPECIES: SimSpeciesProfile[] = [
  {
    id: "red-fox",
    commonName: "Red Fox",
    scientificName: "Vulpes vulpes",
    summary:
      "Adaptable mesocarnivore; tolerates peri-urban edges, follows hedgerows and forest fringes, mostly nocturnal.",
    stepMeters: 180,
    maxDailyKm: 12,
    explorationLevel: 0.55,
    barrierSensitivity: 0.35,
    preferredHabitats: ["forest-edge", "farmland", "hedgerow", "scrub"],
    avoidedHabitats: ["dense-urban", "open-water"],
    nocturnal: 0.8,
  },
  {
    id: "roe-deer",
    commonName: "Roe Deer",
    scientificName: "Capreolus capreolus",
    summary:
      "Forest-and-edge ungulate; needs cover, very sensitive to fenced highways, uses woodland corridors.",
    stepMeters: 220,
    maxDailyKm: 8,
    explorationLevel: 0.3,
    barrierSensitivity: 0.85,
    preferredHabitats: ["forest", "forest-edge", "meadow"],
    avoidedHabitats: ["urban", "dense-urban", "open-water"],
    nocturnal: 0.4,
  },
  {
    id: "hermanns-tortoise",
    commonName: "Hermann's Tortoise",
    scientificName: "Testudo hermanni",
    summary:
      "Slow Mediterranean reptile; thermally constrained, small home range, roads are major mortality risk.",
    stepMeters: 30,
    maxDailyKm: 0.6,
    explorationLevel: 0.05,
    barrierSensitivity: 0.95,
    preferredHabitats: ["mediterranean-scrub", "open-forest"],
    avoidedHabitats: ["urban", "open-water", "dense-forest"],
    nocturnal: 0.0,
  },
  {
    id: "wild-boar",
    commonName: "Wild Boar",
    scientificName: "Sus scrofa",
    summary:
      "Generalist omnivore; very mobile, crosses farmland-forest mosaics, increasingly enters peri-urban areas.",
    stepMeters: 350,
    maxDailyKm: 20,
    explorationLevel: 0.5,
    barrierSensitivity: 0.5,
    preferredHabitats: ["forest", "farmland", "wetland-edge"],
    avoidedHabitats: ["dense-urban"],
    nocturnal: 0.75,
  },
  {
    id: "grey-wolf",
    commonName: "Grey Wolf",
    scientificName: "Canis lupus",
    summary:
      "Wide-ranging apex predator; large home range, long-distance dispersal, avoids dense human infrastructure.",
    stepMeters: 600,
    maxDailyKm: 35,
    explorationLevel: 0.75,
    barrierSensitivity: 0.65,
    preferredHabitats: ["forest", "wilderness", "tundra"],
    avoidedHabitats: ["dense-urban", "intensive-agri"],
    nocturnal: 0.6,
  },
];

export function getSimSpecies(id: string): SimSpeciesProfile | undefined {
  return SIM_SPECIES.find((s) => s.id === id);
}
