---
name: AnimalView photo stepper identity
description: Why the context-imagery PRÉC./SUIV. stepper must identify the active photo by object reference, not imageId.
---

# Photo stepper (PRÉC./SUIV.) identity

The right-panel context-imagery stepper tracks which photo is shown via `currentPhotoIndex`,
computed by finding `activeMatch` inside `orderedMatches`.

**Do NOT key this on `match.imageId`.** Several imagery providers leave `imageId` undefined
(Street View matches set `previewUrl` but no `imageId`). Comparing `imageId === imageId` then
collapses every undefined-id match onto the first one, so the index freezes and SUIV never advances.

**Correct identity = object reference** (`o.match === activeMatch`). Both `goToPhoto` and the
auto-follow effect assign the exact same match object pulled from `imageryMatches`, so reference
equality is reliable.

**Related:** an auto-follow effect re-selects the closest photo to `currentPoint` whenever the
playhead moves. Manual stepping moves the playhead, so a `manualPhotoRef` flag gates that effect
(set true on manual nav, reset on play/mode-change) — otherwise manual selection is instantly stomped.

**Why:** these two bugs together made the stepper appear completely broken; both are non-obvious
because the data flows through useMemo wrappers.
