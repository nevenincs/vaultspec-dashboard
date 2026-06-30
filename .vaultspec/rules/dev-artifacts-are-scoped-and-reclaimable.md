---
name: dev-artifacts-are-scoped-and-reclaimable
---

# Dev artifact stores are project-scoped or shared, and reclaimable

## Rule

Dev-environment artifact stores — Cargo build targets, model caches
(`~/.cache/huggingface`), and git worktrees — must be project-scoped or
shared-deduplicated and have a documented reclamation path; an unbounded
per-worktree global sprawl is a defect. Concretely: worktree builds share one
`CARGO_TARGET_DIR` rather than each minting a full multi-GB `engine/target`; a
completed agent worktree is torn down (`git worktree remove --force`) once its
work is merged; rag's model downloads are scoped with `HF_HOME` so they do not
co-mingle with other tools' global cache; and `just dev clean` reclaims the lot.

## Why

This sprawl is not cosmetic — it crashed the engine. The `resource-hardening`
audit measured ~106 GB on disk against 45 GB free, with the engine `crash.log`
looping on `Os 1455` "paging file too small" and `sqlite: out of memory`: the
proximate cause of a hard production failure. The bulk was seven abandoned agent
worktrees each carrying its own 4-7 GB `engine/target` plus a duplicated torch
`.venv` (no shared `CARGO_TARGET_DIR`, no teardown policy), and a 47 GB
HuggingFace cache that co-mingled rag's models with unrelated tools' because rag
never scoped `HF_HOME`. The engine's own in-app leaks were real but secondary;
the disk-full condition is what actually took it down. A bounded backend is
worthless if the dev environment around it exhausts the same disk and memory.

## How

- **Good:** worktree builds point at one shared `CARGO_TARGET_DIR`; merged agent
  worktrees are removed; `HF_HOME` is project-scoped; `just dev clean` prunes the
  target, dead worktree admin entries, and tmp scratch in one command.
- **Bad:** spawning agent worktrees that each `cargo build` into their own
  `engine/target` and leaving them after merge; letting rag download models into
  the shared global HF cache with no scoping or eviction — both recreate the
  multi-tens-of-GB sprawl that starved the paging file.

## Status

Active. Promoted (per explicit campaign directive to codify Class-A prevention)
from the `resource-hardening` wave of the `2026-06-15-performance-sweep`
campaign. First codified occurrence; revisit if the scoping mechanisms shift.

## Source

ADR `2026-06-15-resource-hardening-adr` and research
`2026-06-15-resource-hardening-research` (Class A: agent-worktree sprawl,
HuggingFace cache, `engine/target`). Sibling rules
`bounded-by-default-for-every-accumulator`, `published-wheel-purity`.
