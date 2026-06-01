---
name: esbuild externalizes @google/* — direct dep required
description: Why a server artifact using Gemini/@google/genai must declare it as a direct dependency
---

The api-server `build.mjs` externalizes `@google/*` (and many other native/unbundleable packages) from the esbuild bundle.

**Rule:** if a server artifact imports a lib that uses `@google/genai` (e.g. `@workspace/integrations-gemini-ai`), the artifact must declare `@google/genai` as its OWN direct dependency in `package.json`, then `pnpm install`.

**Why:** esbuild leaves `@google/*` as a runtime `import`, but `@google/genai` is only a *transitive* dep of the lib. pnpm does not hoist it into the artifact's `node_modules`, so node throws `ERR_MODULE_NOT_FOUND` at startup. Build succeeds (esbuild resolves transitives from the lib's location); only runtime fails.

**How to apply:** when wiring any externalized package (check `build.mjs` external list) that arrives via a workspace lib, add it directly to the consuming artifact. Same pattern would apply to other entries in that external list.
