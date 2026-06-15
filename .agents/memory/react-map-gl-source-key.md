---
name: react-map-gl Source key
description: Why conditionally-rendered react-map-gl <Source> components need a stable key prop
---

Each conditionally-rendered `<Source>` in the MapLibre map (home.tsx) must carry a stable `key` matching its id (e.g. `key="track-buffer"`, `key="track"`).

**Why:** react-map-gl asserts a `<Source>` instance's `id` never changes. When sibling Sources are conditionally rendered (`{cond && <Source/>}`) and a condition toggles, React can reconcile one Source instance into a different id, throwing `Error: source id changed` from updateSource — this crashes the whole map (uncaught, no error boundary). Adding a new conditional Source as the first sibling (the 1km buffer) surfaced this.

**How to apply:** any time you add or reorder a conditional `<Source>` in home.tsx, give it a unique stable `key`. Do not rely on render order.
