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
import { hasMovebank } from "../lib/providers";
import {
  searchMovebankStudies,
  listMovebankIndividuals,
} from "../lib/movebank";
import {
  isRealStudy,
  listRealStudies,
  listRealIndividuals,
} from "../lib/realTracks";

const router: IRouter = Router();

router.get("/species", (_req, res) => {
  const data = ListSpeciesResponse.parse({ species: DEMO_SPECIES });
  res.json(data);
});

router.get("/studies", async (req, res) => {
  const parsed = ListStudiesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "species query param required" });
    return;
  }
  const demoStudies = DEMO_STUDIES[parsed.data.species] ?? [];
  const bundledStudies = listRealStudies(parsed.data.species);
  let realStudies: typeof demoStudies = [];
  if (hasMovebank()) {
    const sp = DEMO_SPECIES.find((s) => s.id === parsed.data.species);
    if (sp) {
      try {
        realStudies = await searchMovebankStudies(sp.scientificName);
      } catch (err) {
        req.log.warn({ err }, "movebank studies fetch failed");
      }
    }
  }
  const data = ListStudiesResponse.parse({
    studies: [...bundledStudies, ...realStudies, ...demoStudies],
  });
  res.json(data);
});

router.get("/individuals", async (req, res) => {
  const parsed = ListIndividualsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "studyId query param required" });
    return;
  }
  const { studyId } = parsed.data;
  if (studyId.startsWith("demo-")) {
    const individuals = DEMO_INDIVIDUALS[studyId] ?? [];
    res.json(ListIndividualsResponse.parse({ individuals }));
    return;
  }
  if (isRealStudy(studyId)) {
    const individuals = listRealIndividuals(studyId);
    res.json(ListIndividualsResponse.parse({ individuals }));
    return;
  }
  if (hasMovebank()) {
    try {
      const individuals = await listMovebankIndividuals(studyId);
      res.json(ListIndividualsResponse.parse({ individuals }));
      return;
    } catch (err) {
      req.log.warn({ err }, "movebank individuals fetch failed");
    }
  }
  res.json(ListIndividualsResponse.parse({ individuals: [] }));
});

export default router;
