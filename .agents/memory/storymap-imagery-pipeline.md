---
name: StoryMap imagery pipeline
description: Building photo-chapter experiences from the imagery matcher — downsampling, index remap, uniform preview rendering.
---

# StoryMap / imagery-chapter pipeline

When composing a chapter-based experience from `matchImagery` along a GPS track:

- **The matcher queries providers per track point.** A multi-thousand-point track makes
  `POST /api/match-imagery` run the full server timeout (~120s) and abort. Always
  **downsample the points you send to the matcher** (cap ~120) and keep a
  `sampleOrig[]` index map so you can remap each match's `trackPointIndex` back to a
  full-resolution index. Keep the full track only for the map line and turf stats.
  **Why:** provider fan-out is the bottleneck, not the geometry.

- **Every `ImageryMatch` carries `previewUrl`, including `google`** (server returns a
  proxied Street View URL). So chapter/gallery photos can all render uniformly from
  `match.previewUrl` — no need to special-case google for display. Only `analyzeImagery`
  differs: google uses `panoId`+`heading` server-side, others pass `imageUrl`.

- **Raw generated client fns** (`matchImagery`, `analyzeImagery`, `getWeather`) are
  re-exported from `@workspace/api-client-react` (barrel does `export * from generated/api`).
  Use them directly inside `Promise.all` for per-chapter enrichment instead of abusing
  React Query hooks in a loop.

- For "best + spread" chapter selection: sort by confidence rank then ascending
  `distanceM`, greedily pick with an index-gap spacing constraint, then relax to fill.
  Exclude `gbif` (species photos, not ground/terrain) for journey storytelling.

- **Timeouts came from un-bounded provider fetches, not missing cache.** Every
  provider lookup (`googleMetadata`, `mapillaryNearby`, `wikimediaNearby`,
  `gbifNearby`, `gbifTaxonKey`) must use `fetchWithTimeout` (AbortController, ~8s) —
  probes run in batches across many points, so one hung upstream stalled the whole
  batch until the ~120s global timeout aborted everything. Fail fast → that point
  just yields no match.
  **Why:** the in-memory cache only helps repeat builds; the *first* build still
  hangs without per-fetch timeouts.

- **`metadataCache` stores Promises, not values (`cachedLookup`)** → coalesces
  concurrent identical-coordinate lookups into one upstream call. It evicts on
  reject, so a transient failure/timeout/non-2xx is NEVER cached (provider fns throw
  on `!r.ok` instead of caching null). Only definitive "no data here" (resolved
  null/[]) is cached. Verified: cold ~2.5s → warm ~0.06s.

- **3D terrain on the StoryMap map** uses a `raster-dem` source draped under the
  Esri satellite raster, declared via a top-level `terrain` key in the MapLibre
  style object (react-map-gl applies it on load). DEM = AWS open "Terrain Tiles"
  (`elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, `encoding: "terrarium"`,
  maxzoom 15) — key-less, real elevation, fits the real-data-only policy. Camera
  gets `pitch`/`bearing` in flyTo (chapters) and fitBounds (overview).
  **Gotcha:** the installed `maplibre-gl` is **v4.x** — the `sky` layer type does
  NOT exist until v5, so don't add a `{type:"sky"}` layer (it breaks the style).
