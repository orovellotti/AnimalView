---
name: GBIF context imagery
description: Using GBIF occurrence media as a real-data context-imagery provider, and the activeMatch/gallery coupling pitfall in the right panel.
---

# GBIF as a context-imagery provider

GBIF (Global Biodiversity Information Facility) is a valid REAL-data imagery source for AnimalView — open API, **no API key**. It returns genuine, naturalist-contributed photos of the species near the track (different from Street View/Mapillary terrain).

Flow: resolve `scientificName` → taxonKey via `species/match` (cache only on a successful HTTP response — never cache a transient failure, or one hiccup suppresses the species until restart), then `occurrence/search?mediaType=StillImage&taxonKey=...&geoDistance=lat,lon,<radius>m`. Image URL is `results[].media[].identifier` (often inaturalist-open-data.s3.amazonaws.com); coords from `decimalLatitude/Longitude`, date from `eventDate`.

**Why GBIF needs `scientificName` in the request body:** match-imagery is otherwise species-agnostic; GBIF is the only provider that must know which taxon to query. The frontend passes `selectedSpecies.scientificName`.

Coverage is genuinely sparse in remote regions (e.g. forest elephant in Cameroon → 0 photos). That's honest real-data behavior — do not fabricate.

GBIF image hosts are NOT in `ALLOWED_IMAGE_HOSTS`, so GBIF photos are displayable but not AI-analyzable (acceptable).

## Right-panel activeMatch / gallery coupling (pitfall)

**Rule:** the imagery detail view AND the thumbnail gallery render only inside the `activeMatch ? (...)` branch. The auto-follow effect picks the closest match within `max(radius,1500)m` of the playhead and would `setActiveMatch(null)` when none is near — leaving the panel empty even though photos exist.

**Why:** user reported "I can't find any context picture" — matches existed but none sat near the current playhead, so the panel showed the empty prompt.

**How to apply:** the auto-follow effect must fall back to the single nearest match overall (`closest ?? nearest`) so `activeMatch` is never null when `imageryMatches` has geolocated entries. Keep this invariant if you touch that effect or restructure the panel.
