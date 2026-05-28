import { Router, type IRouter } from "express";
import {
  SimulateTrackBody,
  SimulateTrackResponse,
  ListSimSpeciesResponse,
} from "@workspace/api-zod";
import { SIM_SPECIES } from "../lib/simSpecies";
import { simulateTrack } from "../lib/simulator";

const router: IRouter = Router();

router.get("/sim-species", (_req, res) => {
  const data = ListSimSpeciesResponse.parse({
    species: SIM_SPECIES.map((s) => ({
      id: s.id,
      commonName: s.commonName,
      scientificName: s.scientificName,
      summary: s.summary,
      stepMeters: s.stepMeters,
      maxDailyKm: s.maxDailyKm,
      explorationLevel: s.explorationLevel,
      barrierSensitivity: s.barrierSensitivity,
    })),
  });
  res.json(data);
});

router.post("/simulate-track", async (req, res) => {
  const parsed = SimulateTrackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid body", issues: parsed.error.issues });
    return;
  }
  try {
    const result = await simulateTrack(parsed.data);
    const data = SimulateTrackResponse.parse({
      speciesId: result.speciesId,
      individualId: result.individualId,
      points: result.points,
      barriers: result.barriers,
      warnings: result.warnings,
    });
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "simulate-track failed");
    const msg = err instanceof Error ? err.message : "simulation failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
