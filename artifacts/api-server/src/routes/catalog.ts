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

type SpeciesEntry = (typeof SPECIES)[number];
type StudyLogger = { warn: (obj: unknown, msg: string) => void };

async function studiesForSpecies(
  species: SpeciesEntry,
  log: StudyLogger,
): Promise<ReturnType<typeof listRealStudies>> {
  const bundledStudies = listRealStudies(species.id);
  let movebankStudies: ReturnType<typeof listRealStudies> = [];
  if (hasMovebank()) {
    try {
      movebankStudies = await searchMovebankStudies(species.scientificName);
    } catch (err) {
      log.warn({ err }, "movebank studies fetch failed");
    }
  }
  return [...bundledStudies, ...movebankStudies];
}

router.get("/species", async (req, res) => {
  const results = await Promise.all(
    SPECIES.map(async (sp) => ({
      species: sp,
      hasTracks: (await studiesForSpecies(sp, req.log)).length > 0,
    })),
  );
  const species = results.filter((r) => r.hasTracks).map((r) => r.species);
  res.json(ListSpeciesResponse.parse({ species }));
});

router.get("/studies", async (req, res) => {
  const parsed = ListStudiesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "species query param required" });
    return;
  }
  const sp = SPECIES.find((s) => s.id === parsed.data.species);
  const studies = sp
    ? await studiesForSpecies(sp, req.log)
    : listRealStudies(parsed.data.species);
  const data = ListStudiesResponse.parse({ studies });
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
