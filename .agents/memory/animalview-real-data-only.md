---
name: AnimalView real-data-only policy
description: AnimalView must never fabricate animal data; how track/catalog endpoints behave when no real data exists
---

# AnimalView: real data only

All synthetic/demo fallbacks were removed from the AnimalView API. The app serves **only** real data: bundled CSV tracks (`api-server/data/*.csv`, registered in `realTracks.ts` CATALOGS) plus Movebank (when `MOVEBANK_*` creds are set).

**Rule:** Never reintroduce fabricated tracks, studies, individuals, or imagery as a fallback.

**Why:** A previous `generateDemoTrack` fallback silently returned a fake Banff track for any unknown/mismatched study+individual combo. This masked real bugs (e.g. stale cascading-select state) and showed users plausible-looking but invented GPS data — unacceptable for a wildlife-tracking app.

**How to apply:**
- `GET /api/track` returns `404 {error}` when no real track exists (no demo fallback).
- The species catalog lives in `api-server/src/lib/species.ts` (real taxonomy + scientific names used for Movebank study search) — it is NOT demo data.
- `/studies` = bundled real studies + Movebank only; `/individuals` has no `demo-` branch.
- Frontend handles 404 via empty query state (activePoints null → nothing rendered).
