import { Router, type IRouter } from "express";
import {
  ListSpeciesResponse,
  ListStudiesQueryParams,
  ListStudiesResponse,
  ListIndividualsQueryParams,
  ListIndividualsResponse,
} from "@workspace/api-zod";
import { SPECIES } from "../lib/species";
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
  const data = ListSpeciesResponse.parse({ species: SPECIES });
  res.json(data);
});

router.get("/studies", async (req, res) => {
  const parsed = ListStudiesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "species query param required" });
    return;
  }
  const bundledStudies = listRealStudies(parsed.data.species);
  let movebankStudies: typeof bundledStudies = [];
  if (hasMovebank()) {
    const sp = SPECIES.find((s) => s.id === parsed.data.species);
    if (sp) {
      try {
        movebankStudies = await searchMovebankStudies(sp.scientificName);
      } catch (err) {
        req.log.warn({ err }, "movebank studies fetch failed");
      }
    }
  }
  const data = ListStudiesResponse.parse({
    studies: [...bundledStudies, ...movebankStudies],
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
