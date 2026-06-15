---
name: Map crash from invalid track coordinates
description: Why raw track/sim points must be coordinate-sanitized before feeding MapLibre, and where it bit us.
---

# Map crash from invalid track coordinates

Feeding a single bad point (NaN/null/out-of-range lat or lon) into the MapLibre
GeoJSON `<Source>` and `map.fitBounds(...)` throws an **uncaught** error that
blanks the whole map. Because it's thrown outside React render, a React error
boundary would NOT catch it.

**Why:** this surfaced as "the interface crashes sometimes when loading a new
individual id" — it fires exactly when a new track loads, and mixed-taxon /
hand-extracted CSV tracks (e.g. the puma Fishlake set) are prime sources of a
stray malformed row.

**How to apply:** sanitize `activePoints` once (filter to
`Number.isFinite(lat/lon)` and `|lat|<=90 && |lon|<=180`, return null if empty),
and feed that sanitized array to everything — GeoJSON sources, `fitBounds`
(also wrap in try/catch + finite check), AND outbound requests like
match-imagery. This stays consistent with the real-data-only policy: drop the
invalid rows, keep the real ones, never fabricate. Clamp the playhead index
(`Math.min(currentTimeIndex, len-1)`) so a shorter new track can't transiently
index past the end.
