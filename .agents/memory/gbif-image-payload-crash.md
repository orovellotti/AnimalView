---
name: GBIF image payload crashes the browser tab
description: Why GBIF/iNaturalist preview images must be downsized server-side, and where this bit us.
---

# GBIF image payload crashes the browser tab

GBIF occurrence media `identifier` URLs point at the **full-resolution original**
photo. For iNaturalist (the dominant GBIF media host) that's a multi-MB
`/original.<ext>` image. The context-imagery / candidate panel mounts **every**
match as an `<img>` at once (large preview with CSS blend/filter compositing +
a 3-column thumbnail grid), so a track yielding dozens of GBIF occurrences loads
hundreds of MB of bitmaps → the browser tab runs out of memory and crashes.
A symptom on the server side: a `/api/match-imagery` request that hangs for ~100s
then aborts.

**Why:** GBIF is the only provider that returns originals — Google is proxied at
640×360, Mapillary/Wikimedia already return sized thumb URLs. So GBIF is the lone
payload offender.

**How to apply:** downsize iNaturalist URLs server-side before returning them as
`thumbUrl` — rewrite the `/original` path segment to `/medium` (~500px, ~100KB)
via the parsed `URL.pathname` (case-insensitive, extension-agnostic, preserving
query/hash). Only rewrite known iNaturalist hosts
(`inaturalist-open-data.s3.amazonaws.com`, `static.inaturalist.org`,
`*.inaturalist.org`); leave unknown hosts untouched (their resize scheme is
unknown). Add `loading="lazy"` + `decoding="async"` on the gallery `<img>`s as a
secondary safeguard (does NOT fix multi-MB originals on its own).

**Residual risk / follow-up:** non-iNaturalist GBIF originals are still served
full-size. If a species pulls many of those, consider a bounded cap on rendered
candidate images (keep nearest N) — deferred because the project's ethos is to
show ALL real data, so capping is a product decision, not a silent default.
