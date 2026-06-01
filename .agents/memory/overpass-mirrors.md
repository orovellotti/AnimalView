---
name: Overpass mirror reliability & dense-query splitting
description: Which Overpass endpoint actually works from this environment, and why alpine OSM queries must be split sparse-vs-trails.
---

# Use overpass.openstreetmap.fr as the primary mirror

From this Replit environment, `https://overpass-api.de/api/interpreter` frequently
**refuses connections (ECONNREFUSED)** — especially after a burst of test queries
(IP throttling) — and `overpass.kumi.systems` / `overpass.private.coffee` routinely
**time out** on non-trivial queries. `maps.mail.ru` returns **403**.

The reliable mirror is **`https://overpass.openstreetmap.fr/api/interpreter`**: ~0.8s
for a small probe, ~2.5s for a full track query. Put it **first** in the endpoint
fallthrough list; keep the others as fallbacks.

**How to apply:** any OSM/Overpass fetcher in this repo (osmHumanPresence.ts,
osmBarriers.ts, future ones) should list the FR mirror first. If OSM features come
back empty/slow, check the server logs for ECONNREFUSED/AbortError before suspecting
the query or coordinates.

# Split dense alpine queries: sparse vs trails, run in parallel

A single Overpass union over a multi-km alpine bbox that includes
`way["highway"~"path|track|footway|..."]` (hiking trails) **exceeds 30s and aborts** —
trails are extremely dense in the mountains, unlike the sparse barrier tags (major
roads, landuse) which are fast.

**Fix that worked:** run TWO queries concurrently with independent AbortController
timeouts — a "sparse" one (place/roads/tourism/amenity/aerialway/leisure) and a
"trails" one — then merge whatever returns. The heatmap still renders if trails are
slow/fail. Never add a bare `way["building"]` scan: it dominates query time and is
redundant with settlements/tourism for a *presence* signal.

**Why:** graceful degradation + bounded latency. Cache a *partial* result (only one
query succeeded) with the short failure TTL, not the full 30-min TTL, so it recovers
once the failing mirror is healthy.
