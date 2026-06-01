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
