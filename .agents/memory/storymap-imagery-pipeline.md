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
