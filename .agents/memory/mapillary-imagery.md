---
name: Mapillary imagery provider
description: How the Mapillary v4 Graph API behaves in /match-imagery — token format, bbox area cap, sparse alpine coverage.
---

# Mapillary imagery (`/match-imagery`)

## Token must match the canonical pattern, normalize it in code
- A Mapillary v4 client token has the shape `MLY|<numeric appId>|<32 hex>` (54 chars for a 17-digit appId).
- The env value is normalized at read time by extracting `/MLY\|\d+\|[0-9a-f]{32}/i` and falling back to `.trim()`. This survives copy/paste artifacts (a stray trailing digit, surrounding whitespace) that otherwise cause HTTP 400 `Error verifying the token`.
- **Why:** users repeatedly saved the secret with an extra trailing character (e.g. one too many → 55 chars). Auth then fails silently and Mapillary returns 0 matches. Normalizing in code is more reliable than another round-trip to re-enter the secret.
- Distinct failure messages worth recognizing: `Cannot parse` = wrong prefix/format (not `MLY|...`); `Error verifying the token` = parseable but value invalid (often the extra-char case).

## bbox area is hard-capped at 0.010 sq deg
- Mapillary `/images?bbox=...` returns HTTP 500 `Bounding box area is too large. Maximum allowed area is 0.010 square degrees` when the box is too big.
- Our search radius can go up to 10000m; a naive lat/lon box at large radius exceeds the cap. Clamp by scaling `dLat`/`dLon` (preserving aspect) so `2*dLat * 2*dLon <= ~0.0099`.
- **Why:** without the clamp, large-radius requests 500 and the provider silently contributes 0 — looked like "no coverage" when it was a request error.

## Coverage is genuinely sparse in remote alpine terrain
- Even with a valid token + correct bbox, isolated high-alpine areas may have few/no street-level images. Degrade gracefully (provider just returns fewer matches).
- For the alcotra-lemed-ibex track: radius 2000 → ~7 mapillary, radius 5000 → ~18 mapillary. Larger radius finds more because it reaches valley roads/trails with contributor photos.
