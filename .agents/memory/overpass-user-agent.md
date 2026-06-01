---
name: Overpass API requires a User-Agent
description: Why server-side fetch to Overpass must set a User-Agent header, and the long-track nearest-barrier probe pattern.
---

# Overpass requires a User-Agent header

Server-side `fetch` to the Overpass API (overpass-api.de et al.) returns **HTTP 406 Not Acceptable** when no `User-Agent` header is sent (Node's default fetch UA is rejected, same as curl's default UA). The response is HTML, not JSON.

**Symptom:** barrier/OSM queries silently return empty feature lists. In code that catches non-`ok` responses and falls through to an empty result (with a short failure-cache TTL), every call looks "successful" (HTTP 200 from our own endpoint) but `features: []`.

**Fix:** always send a descriptive `User-Agent` on Overpass requests, e.g. `"AnimalView/1.0 (wildlife tracking; Bear71-inspired)"`. With it, Overpass returns 200 + JSON. For production robustness, include a contact/app URL to reduce blocking.

**How to apply:** any new outbound call to Overpass (or similar OSM/community endpoints that gate on UA) must set `User-Agent`. When OSM-backed features return empty, check the UA header before assuming the query or coordinates are wrong.

# Nearest-barrier on long tracks must be location-aware

The track-wide human-pressure fetch is centred on the whole track's bounding box and the radius is **capped at 20 km**. For long dispersal tracks (e.g. Slavc, ~2000 km) this only covers a small patch near the centroid, so a "nearest barrier to the current playhead" computed from that dataset is misleading (real distance, but not the true nearest).

**Why:** the centroid fetch exists for the heatmap, where coarse coverage is acceptable; a precise per-point distance readout is not.

**How to apply:** for the nearest-barrier card, issue a *separate* probe around the **current point**, quantised to a ~0.02° grid (so the playhead advancing doesn't refire on every tick) with a small radius (~5 km). Keep the centroid fetch for the heatmap. If nothing is within the probe radius, show no card (honest — no fabricated fallback).
