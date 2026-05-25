import { Router, type IRouter } from "express";
import {
  ListSpeciesResponse,
  ListStudiesQueryParams,
  ListStudiesResponse,
  ListIndividualsQueryParams,
  ListIndividualsResponse,
} from "@workspace/api-zod";
import {
  DEMO_SPECIES,
  DEMO_STUDIES,
  DEMO_INDIVIDUALS,
} from "../lib/demoData";

const router: IRouter = Router();

router.get("/species", (_req, res) => {
  const data = ListSpeciesResponse.parse({ species: DEMO_SPECIES });
  res.json(data);
});

router.get("/studies", (req, res) => {
  const parsed = ListStudiesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "species query param required" });
    return;
  }
  const studies = DEMO_STUDIES[parsed.data.species] ?? [];
  const data = ListStudiesResponse.parse({ studies });
  res.json(data);
});

router.get("/individuals", (req, res) => {
  const parsed = ListIndividualsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "studyId query param required" });
    return;
  }
  const individuals = DEMO_INDIVIDUALS[parsed.data.studyId] ?? [];
  const data = ListIndividualsResponse.parse({ individuals });
  res.json(data);
});

export default router;
