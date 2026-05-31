---
name: AnimalView real-data-only policy
description: AnimalView must never fabricate animal data; how track/catalog endpoints behave when no real data exists
---

# AnimalView: real data only

All synthetic/demo fallbacks were removed from the AnimalView API. The app serves **only** real data: bundled CSV tracks (`api-server/data/*.csv`, registered in `realTracks.ts` CATALOGS) plus Movebank (when `MOVEBANK_*` creds are set).

**Rule:** Never reintroduce fabricated tracks, studies, individuals, or imagery as a fallback.

**Why:** A previous `generateDemoTrack` fallback silently returned a fake Banff track for any unknown/mismatched study+individual combo. This masked real bugs (e.g. stale cascading-select state) and showed users plausible-looking but invented GPS data — unacceptable for a wildlife-tracking app.

**How to apply:**
- `GET /api/track` returns `404 {error}` when no real track exists (no demo fallback).
- The species catalog lives in `api-server/src/lib/species.ts` (real taxonomy + scientific names used for Movebank study search) — it is NOT demo data.
- `/studies` = bundled real studies + Movebank only; `/individuals` has no `demo-` branch.
- Frontend handles 404 via empty query state (activePoints null → nothing rendered).

## Context imagery sparsity (Wikimedia fallback)

When Google/Mapillary keys are absent, "Find Context Imagery" falls back to Wikimedia Commons geosearch (no key needed). Real geotagged photos are sparse in wilderness: the Slovenia/Italy Slavc wolf track finds ~10, but remote NE Alberta wolf tracks (boutin-alberta-wolf) legitimately return 0 at any radius. Zero matches there is correct behavior, not a bug.

**Rule:** Don't fabricate imagery to "fill" empty tracks. Instead surface a clear empty-state message.

**Robustness lesson:** Wikimedia geosearch must request several candidates (ggslimit ~20) and pick the nearest one that actually has both a thumbnail and coordinates. With ggslimit=1, a single nearest result missing either field made the whole point yield nothing.

**UI lesson:** imageryMatches is local state — clear it on search start AND when study/individual/mode changes, and gate success-count text behind the mutation's isSuccess/!isPending, or stale counts linger across track switches.

## Street View images: proxy bytes, never redirect

The /api/streetview-image route must FETCH the Google Street View Static image server-side and stream the JPEG bytes back — never `res.redirect()` to the Google URL.

**Why:** A 302 redirect (1) embeds GOOGLE_MAPS_API_KEY in a client-visible URL (key leak), and (2) makes the browser load the image cross-origin from Google with the app domain as Referer — Google key referrer restrictions then block it in production while it still works in dev. Server-side fetch has no browser Referer (confirmed: a no-Referer request returns 200), so it works regardless of referrer restrictions and hides the key.

**How to apply:** Any third-party image needing a secret key → proxy bytes through the server, set Content-Type + Cache-Control, return 502 on upstream failure.
