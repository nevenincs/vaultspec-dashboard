---
name: dev-workflow
---

# Dev workflow: full gate, revision precedence, explicit ports

- **Declaring green runs the full gate.** Before reporting a change green, committing it, or routing it to review, run the FULL lint gate for the touched language — `just dev lint frontend` (eslint + prettier + tsc) or `just dev lint all` (adds Rust `cargo fmt --check` + clippy) — and confirm exit 0. A partial run (eslint-only, clippy without fmt) is not green. The reviewer runs the full recipe independently; a prettier- or rustfmt-dirty file is a withhold regardless of logic.
- **Required revisions block forward work.** When a phase review verdict is withheld or carries required revisions, the revision commit must land and pass the reviewer's re-check before any forward phase work begins. Review service is withheld for work executed past that block.
- **Dev/test servers bind explicit non-default strict ports.** Every long-lived dev/test server binds an explicit port from `frontend/dev-ports.ts` `DEV_PORTS` (the 87xx block) with `strictPort: true` / fail-loud-on-conflict — never a framework default (Vite 5173) and never drift-to-next-free. SPA = 8770, engine = 8767, graph-lab = 8775, adverse = 8774, perf = 8776; env-overridable via `VAULTSPEC_DEV_*_PORT`. The one exception is the vitest live-engine harness (OS-assigned ephemeral port). Clear a stale same-project server on the canonical ports before starting; verify live work ONLY against the canonical port, and treat any vaultspec server on a non-canonical port as stale/foreign.
