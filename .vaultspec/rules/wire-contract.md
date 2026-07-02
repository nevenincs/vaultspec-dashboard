---
name: wire-contract
---

# Wire contract: tiers, served state, live tests, stable ids

- **Every response carries the `tiers` block** — success and error, CLI `--json` and HTTP — built through the shared `vaultspec-api` envelope helper. No hand-built response bodies. An error envelope still carries `tiers` so a client distinguishes "your request was wrong" from "a backend is down".
- **Degradation is read from `tiers`, never guessed.** A stores reader derives degraded/offline only from the `tiers` block: from the success envelope, or from the error envelope's tiers, with fresh error tiers winning over a stale held-success block. Never infer offline from a bare transport error or timeout. Gate every fallback on tiers truth.
- **Displayed/filterable state is backend-served, never frontend-derived.** Any value shown or filtered by (status, category, completion, count, classification) is served by the engine — even when the inputs are on the wire. Derivations live in the engine projection. Counts/rollups/percentages are computed engine-side over the FULL pre-truncation set, never re-counted client-side over a paginated/capped slice. Frontend maps only presentation (served token → label, dot tone).
- **Tests exercise the live wire.** The frontend suite runs ONLINE against the real `vaultspec serve` origin over the committed fixture vault (`frontend/src/testing/fixtures/`), via the vitest `globalSetup` and shared `liveClient`. Never `vi.mock`/stub/fake the engine wire. Wire-shape variation is absorbed by the tolerant `frontend/src/stores/server/liveAdapters.ts`, exercised against reality.
- **Stable keys are identity-bearing.** An edge/node stable key derives only from what the relationship IS — source, target, relation, tier, and provenance fields naming the producing fact — never from volatile inputs or resolution/rule outcomes (resolved/stale/broken state lives outside the key). Any stable-key composition change is a contract event reviewed by engine + GUI owners, never a refactor.
