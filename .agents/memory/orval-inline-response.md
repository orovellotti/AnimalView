---
name: Orval — inline 200 responses for new endpoints
description: Avoid generated-name collisions when adding OpenAPI operations
---

When adding a new operation to `lib/api-spec/openapi.yaml`, define the 200 response schema **inline** (under the operation's `responses`), NOT as a named `components/schemas` entry.

**Why:** Orval derives generated type/file names from response component names; a named response can collide with an existing schema name and break codegen or produce ambiguous types. Inline responses get a unique operation-scoped name (e.g. `AnalyzeImagery200`).

**How to apply:** request bodies can still be named components (reused, validated server-side with the generated Zod schema). Keep one-off success responses inline. Do not change `info.title` — it controls generated filenames.
