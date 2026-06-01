---
name: Adding a real GPS track to AnimalView
description: The multi-file procedure to register a new Movebank/CSV animal track so it appears in the species → study → individual → track chain.
---

# Adding a real GPS track (CSV) to AnimalView

Tracks are served by `artifacts/api-server` from bundled CSVs in `artifacts/api-server/data/`
(NOT the DB). A Movebank API fallback exists but bundled CSVs are the primary real source.

To add a new real individual/track, edit in lockstep:

1. **CSV** → copy into `artifacts/api-server/data/<name>.csv`. The parser in `realTracks.ts`
   requires these exact headers: `location-lat`, `location-long`, `timestamp`,
   `individual-local-identifier`. Movebank's standard CSV export already has them.
2. **`realTracks.ts` `CATALOGS`** → add `"<study-id>": { name, file }`. This alone makes
   `isRealStudy`, `listRealIndividuals`, `getRealTrack` work (catalog is lazily loaded).
3. **`realTracks.ts` `listRealStudies(species)`** → add a branch returning the study for the
   matching species id, so `/studies?species=<id>` surfaces it. Without this the study loads
   but never appears in the UI dropdown.
4. **`species.ts` SPECIES** → add the species (id, commonName, scientificName, habitat) if the
   species isn't already listed. The frontend species dropdown is driven by `/species`.

Verify: `curl localhost:80/api/{species,studies?species=X,individuals?studyId=Y,track?studyId=Y&individualId=Z}`.

**Why:** wiring is spread across 4 spots; missing step 3 is the silent failure (data present, invisible).

**Gotcha:** `listRealIndividuals` labels purely-numeric IDs as `Wolf <id>` regardless of species
(legacy). Non-numeric IDs display verbatim. Fix the label if a future numeric-ID non-wolf dataset lands.
