---
name: GBIF context imagery
description: Using GBIF occurrence media as a real-data context-imagery provider, and the activeMatch/gallery coupling pitfall in the right panel.
---

# GBIF as a context-imagery provider

GBIF (Global Biodiversity Information Facility) is a valid REAL-data imagery source for AnimalView — open API, **no API key**. It returns genuine, naturalist-contributed photos of the species near the track (different from Street View/Mapillary terrain).

Flow: resolve `scientificName` → taxonKey via `species/match` (cache only on a successful HTTP response — never cache a transient failure, or one hiccup suppresses the species until restart), then `occurrence/search?mediaType=StillImage&taxonKey=...&geoDistance=lat,lon,<radius>m`. Image URL is `results[].media[].identifier` (often inaturalist-open-data.s3.amazonaws.com); coords from `decimalLatitude/Longitude`, date from `eventDate`.

**Why GBIF needs `scientificName` in the request body:** match-imagery is otherwise species-agnostic; GBIF is the only provider that must know which taxon to query. The frontend passes `selectedSpecies.scientificName`.

Coverage is genuinely sparse in remote regions (e.g. forest elephant in Cameroon → 0 photos). That's honest real-data behavior — do not fabricate.

GBIF/iNaturalist hosts ARE in the analyze route's `ALLOWED_IMAGE_HOSTS` (exact `inaturalist-open-data.s3.amazonaws.com` + suffix `.inaturalist.org`), so GBIF photos are AI-analyzable like terrain imagery. iNaturalist `/original` URLs must be downsized to `/medium` server-side first — see [GBIF image payload crash](gbif-image-payload-crash.md).

## GBIF lives in a dedicated panel section, separate from terrain imagery

The candidate panel splits matches into **terrainMatches** (google/mapillary/wikimedia — ground/terrain views) and **gbifMatches** (real species photos). GBIF gets its own bordered section browsed by clicking; it does NOT participate in the stepper.

**Coupling pitfall:** the photo collection drives THREE places that share one `activeMatch` — (1) the right-panel preview+stepper+grid, (2) the bottom timeline player (dots + counter + prev/next), and (3) the auto-follow effect. If you change which matches the stepper walks, update all three in lockstep or the bottom dots/counter desync from `currentPhotoIndex`/`goToPhoto` (dead dots, wrong totals).

**Why:** terrain-only stepper with mixed `orderedMatches` in the bottom player caused misaligned dots and a wrong counter total.

**How to apply:** stepper/timeline/auto-follow operate on terrainMatches; GBIF is set only via `goToMatch()` on click. Auto-follow uses `pool = terrain if any terrain exists else all` so it prefers terrain but never empties the panel when only GBIF exists. Highlight selection by object identity (`o.match === activeMatch`), not `imageId` (undefined for Street View).

## Right-panel activeMatch / gallery coupling (pitfall)

**Rule:** the imagery detail view AND the thumbnail gallery render only inside the `activeMatch ? (...)` branch. The auto-follow effect picks the closest match within `max(radius,1500)m` of the playhead and would `setActiveMatch(null)` when none is near — leaving the panel empty even though photos exist.

**Why:** user reported "I can't find any context picture" — matches existed but none sat near the current playhead, so the panel showed the empty prompt.

**How to apply:** the auto-follow effect must fall back to the single nearest match overall (`closest ?? nearest`) so `activeMatch` is never null when `imageryMatches` has geolocated entries. Keep this invariant if you touch that effect or restructure the panel.
