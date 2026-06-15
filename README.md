# AnimalView

**Walk in the footsteps of a wild animal.** AnimalView reconstructs what an animal *could* have seen along its real GPS track by pulling public street-level imagery near each recorded point — a spatial approximation inspired by the interactive documentary [_Bear 71_](https://www.nfb.ca/interactive/bear_71_vr/).

It serves **only real data**: real movement tracks (e.g. Movebank studies), real ground-level imagery (Mapillary, Google Street View / Photo Spheres) and real OpenStreetMap features. Nothing is fabricated — when no real data exists for a location, the app shows nothing rather than inventing it.

## What it does

- **Animated track playback** — replay an animal's journey on a dark or satellite map, with a timeline and adjustable speed.
- **Contextual imagery** — at each position along the track, show real ground-level photos available within a configurable search radius.
- **Human-presence heatmap** — visualize potential human pressure (trails, roads, ski lifts, alpine huts, parking, settlements) derived from OpenStreetMap, to see where the animal's movements overlap with frequented areas.
- **Simulation mode** — explore hypothetical tracks with landscape barriers and a nearest-barrier readout.
- **Weather & analysis** — contextual weather lookups and imagery analysis along the route.

Example real datasets used for testing: an ibex track from the _alcotra-lemed-ibex_ program and the dispersal of the wolf *Slavc*.

## Stack

- **Monorepo:** pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend:** React + Vite, MapLibre GL via `react-map-gl` (`artifacts/animal-view`)
- **API:** Express 5 (`artifacts/api-server`)
- **Database:** PostgreSQL + Drizzle ORM
- **API contract:** OpenAPI-first — Orval generates React Query hooks (`@workspace/api-client-react`) and Zod schemas (`@workspace/api-zod`) from `lib/api-spec/openapi.yaml`
- **Build:** esbuild (CJS bundle)

## Project layout

```
artifacts/
  animal-view/      # React + Vite frontend (MapLibre)
  api-server/       # Express API (port 5000)
  mockup-sandbox/   # Component preview server (design)
lib/
  api-spec/         # OpenAPI spec + Orval codegen config
  ...               # shared libraries (DB, generated client & zod)
scripts/            # shared utility scripts
```

## API endpoints

Served under `/api` (via the shared proxy):

| Method | Path                  | Purpose                                              |
| ------ | --------------------- | --------------------------------------------------- |
| GET    | `/healthz`            | Health check                                        |
| GET    | `/species`            | Available species                                   |
| GET    | `/studies`            | Movement studies (real data catalog)                |
| GET    | `/individuals`        | Tracked individuals for a study                     |
| GET    | `/track`              | GPS track for an individual                         |
| GET    | `/sim-species`        | Species presets for simulation                      |
| POST   | `/simulate-track`     | Generate a simulated track                          |
| GET    | `/human-pressure`     | OSM landscape barriers (simulation / nearest-barrier) |
| GET    | `/human-presence`     | OSM human-presence points with weights (heatmap)    |
| GET    | `/providers`          | Imagery providers                                   |
| POST   | `/match-imagery`      | Find ground-level imagery near a point              |
| GET    | `/streetview-image`   | Proxy a Street View image                           |
| POST   | `/analyze-imagery`    | Analyze imagery along the route                     |
| GET    | `/weather`            | Contextual weather lookup                           |

## Run & operate

```bash
# Run the API server (port 5000)
pnpm --filter @workspace/api-server run dev

# Regenerate API hooks and Zod schemas after editing the OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Full typecheck across all packages
pnpm run typecheck

# Typecheck + build all packages
pnpm run build

# Push DB schema changes (dev only)
pnpm --filter @workspace/db run push
```

> On Replit, apps run via **workflows**, not `pnpm dev` at the repo root. Use the workflow controls / preview pane to run and view the artifacts.

## Environment

Required secrets / variables:

- `DATABASE_URL` — PostgreSQL connection string
- `GOOGLE_MAPS_API_KEY` — Google imagery (Street View / Photo Spheres)
- `MAPILLARY_ACCESS_TOKEN` — Mapillary imagery
- `MOVEBANK_USERNAME`, `MOVEBANK_PASSWORD` — Movebank track access
- `SESSION_SECRET` — server session secret

## Notes

- All external imagery and OSM data is fetched live and cached; coverage in remote alpine terrain is genuinely sparse.
- OpenStreetMap data comes from public Overpass mirrors; `overpass.openstreetmap.fr` is used as the primary endpoint for reliability.
- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and conventions.
