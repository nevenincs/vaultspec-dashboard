---
name: resource-bounds
---

# Resource bounds: every accumulator, subprocess, and artifact store

- **Every accumulator is bounded at creation.** Every cache, channel, queue, retained list/map, and background loop in `engine/` and `frontend/src/stores/` carries an explicit bound where it is created — a size cap, a TTL/retention window, or a channel capacity. No `unbounded_channel`, no only-growing `Vec`/`HashMap`/SQLite table, no `staleTime: Infinity` without `gcTime`, no append-only log without a prune.
- **Every subprocess carries an output cap AND a wall-clock timeout.** Every external process the engine spawns (`vaultspec-core`, `git`, `vaultspec-rag`, on serve and CLI paths) enforces both an output byte cap and a wall-clock timeout at the call site, killing the child on either breach and returning a typed `Timeout`/`OutputTooLarge`. A cap alone or a timeout alone is a defect.
- **Dev artifact stores are scoped and reclaimable.** Worktree builds share one `CARGO_TARGET_DIR`; a merged agent worktree is torn down (`git worktree remove --force`); rag model downloads are scoped with `HF_HOME`; `just dev clean` reclaims the lot. No unbounded per-worktree global sprawl.
- **Published wheel purity.** The published wheel never depends on `vaultspec-rag` or `torch`: both live only in the PEP 735 `dev` group. After any `uv add`/installer/sync that touches `pyproject.toml`, confirm neither migrated into `[project] dependencies`; revert if so. rag is reached over loopback HTTP, never a Python import.
