# AnimalView

A Bear 71-inspired wildlife tracking web app: replay a real animal's GPS journey on a map and see the world it moved through — ground-level context imagery, weather at each moment, human pressure, and landscape barriers. AnimalView serves **only real, verified data** — it never fabricates tracks, studies, or imagery.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/animal-view run dev` — run the web frontend (Vite)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/<slug> run typecheck` — typecheck a single package (use this to verify, not `build`)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod schemas after editing `lib/api-spec/openapi.yaml`
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`. Optional imagery providers: `GOOGLE_MAPS_API_KEY`, `MAPILLARY_ACCESS_TOKEN`. Tracks: `MOVEBANK_USERNAME` / `MOVEBANK_PASSWORD`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, MapLibre GL via react-map-gl, Turf.js (`artifacts/animal-view`)
- API: Express 5 (`artifacts/api-server`)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval from OpenAPI → `@workspace/api-client-react` (React Query hooks) + `@workspace/api-zod` (schemas)
- AI: Gemini via `@workspace/integrations-gemini-ai` (imagery narration)
- Build: esbuild (CJS bundle)

## Where things live

- API contract (source of truth): `lib/api-spec/openapi.yaml` → generated into `lib/api-client-react` + `lib/api-zod` (do not hand-edit generated files; re-run codegen)
- API routes: `artifacts/api-server/src/routes/` — `catalog` (species/studies/individuals), `track`, `imagery` (match/analyze/providers + street-view proxy), `weather`, `simulate` (sim species, human pressure/presence), `health`
- Real track registry: `artifacts/api-server/src/lib/realTracks.ts` (CATALOGS + `listRealStudies`) and `species.ts` (real taxonomy)
- Imagery providers: `artifacts/api-server/src/routes/imagery.ts` (Google Street View, Mapillary, Wikimedia Commons, GBIF) + `src/lib/providers.ts`
- Frontend pages: `artifacts/animal-view/src/pages/` (`landing.tsx`, `home.tsx` — the map experience)
- i18n (FR default / EN): `artifacts/animal-view/src/lib/i18n.tsx`
- DB schema: `lib/db/src/schema`

## Architecture decisions

- **Real data only.** Tracks come from real studies (Movebank + bundled CSVs); imagery is real geotagged photos. When no real data exists for a location/species, the app shows nothing rather than inventing it (e.g. GBIF returns 0 photos for the forest elephant range — that's expected).
- **Contract-first API.** The OpenAPI spec drives both client hooks and server validation. New success responses are defined **inline** (not as named components) to avoid Orval name collisions.
- **Four context-imagery providers, each distinct.** Google/Mapillary/Wikimedia give ground/terrain views; GBIF gives real naturalist photos of the species near the track. Matches are filtered by true distance-to-track and deduped, then browsable as a gallery.
- **Imagery match threshold follows the user's Search Radius** (not a fixed 50 m), because real mountain photos sit hundreds of metres off the GPS path.
- **Bilingual UI** with French as the default language.

## Product

- Pick a real study/individual and replay its GPS track on an interactive map with a timeline.
- "Find Context Imagery" gathers real photos near the track from Google Street View, Mapillary, Wikimedia Commons, and GBIF, shown as a thumbnail gallery + detail view with distance/confidence/date; Gemini can describe the terrain.
- Per-moment weather, human-pressure/presence overlays, and landscape-barrier context.
- A simulation mode models how a chosen species might move across the landscape.

## User preferences

- Communicate in **French**.
- Never fabricate or mock data — only real, verified sources. If real data is unavailable, show nothing.
- After changes are validated, remind the user (in French) to republish.

## Gotchas

- After editing `lib/api-spec/openapi.yaml`, always run `pnpm --filter @workspace/api-spec run codegen`.
- Restart the `artifacts/api-server` workflow after server changes.
- Never use `console.log` in server code — use `req.log` in handlers, `logger` elsewhere.
- Verify with `typecheck`, not `build` (build needs workflow-provided `PORT`/`BASE_PATH`).
- Editing `i18n.tsx` while running triggers a Vite Fast-Refresh full reload (it exports both a provider and the `useLang` hook) — transient console errors there are not real bugs.
- Movebank study-list/attributes endpoints can return 403 per-study (license-gated).

## Pointers

- See `.agents/memory/` for durable lessons (imagery providers, real-data policy, i18n, map source keys, etc.)
- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

