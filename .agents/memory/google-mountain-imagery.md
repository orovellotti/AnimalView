---
name: Google mountain user photos in AnimalView
description: How user-contributed Google Photo Spheres surface as context imagery, and the two non-obvious gotchas.
---

# Surfacing Google user photos ("people's mountain photos")

The imagery context panel pulls Google coverage via the Street View **metadata**
endpoint, then proxies the static image. In remote mountain terrain there is no
official Street View car coverage — the only Google imagery is user-contributed
**Photo Spheres** people shoot on trails/peaks.

Two gotchas (both cost real debugging):

1. **Do NOT add `source=outdoor` to the Street View metadata call.** Counter-intuitively,
   `source=outdoor` returns `ZERO_RESULTS` for user Photo Spheres in the mountains;
   only the **default source** returns them. `outdoor` effectively means "official
   Street View collections", which don't exist on alpine terrain.

2. **The match threshold must follow the user's Search Radius, not a fixed gate.**
   Mountain user photos sit hundreds of metres off the GPS polyline. A fixed 50 m
   intersection threshold drops them all. Use `Math.max(50, radius)` (radius clamped
   server-side to the UI's 500–10000 m range).

**Also:** the Google Places API (place photos) is NOT usable server-side here — the
`GOOGLE_MAPS_API_KEY` has HTTP-referer restrictions, so Places returns
`REQUEST_DENIED / API_KEY_HTTP_REFERRER_BLOCKED`. Street View metadata/static work fine.

**Why:** these defaults silently return empty instead of erroring, so the feature
looks "implemented but broken" until you test the metadata endpoint directly.

## Track sampling for /match-imagery (coverage vs cost)

Animal tracks **meander**: cumulative path length is far larger than the bounding
box (the ibex track is ~255 km of path). So:

- Sample spacing must be a **fixed distance** (e.g. 250 m), NOT tied to the search
  radius. Tying spacing to `radius*2` collapses the whole track to ~1 query point
  at large radius and returns FEWER photos. Radius should only govern how far
  off-track a returned photo may sit (the polyline intersection threshold).
- Fixed 250 m spacing on a 255 km path = ~1000 query points → ~1000 outbound
  provider calls/request = real cost/DoS amplification. Cap query points with
  **deterministic stride thinning** (`step = ceil(n/MAX)`, keep every step-th +
  last) — re-downsampling by a larger distance does NOT guarantee the cap when
  the input is already sparser than the spacing. `MAX_QUERY_POINTS=200` keeps
  ~16 unique photos on the ibex track while bounding fanout to `(MAX+1)×providers`.
- Run probes with **bounded concurrency** (pool ~6) and **dedupe** by
  `provider:panoId|imageId` — the same pano is the nearest to many adjacent samples.

## Providers
- **Mapillary** is the largest crowd-sourced outdoor/trail photo source (ideal for
  alpine wildlife terrain) but is **disabled without `MAPILLARY_ACCESS_TOKEN`**
  (`/api/providers` shows `mapillary:false`). Free token from mapillary.com. This
  is the #1 lever for "more pictures" beyond Google/Wikimedia.
