---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:bab6d18aa50fc46c4775360037a7b6e3c6aea6c53b4883ba04605b142ee92e03'
step_id: 'S04'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---
# Settle where the completion proof runs by checking whether the deterministic service-test stack is container-gated on the current fleet and whether its tests are among the capsule-gated set that passes without executing, delivering a written verdict

## Scope

- `src/vaultspec_a2a/service_tests/`

## Description

- Query the indexed A2A main corpus for the deterministic service stack, external
  prerequisite rule, completion proof, and runner-portability decisions; confirm
  every decisive hit from whole files at isolated A2A revision `7c52f62b590a`.
- Trace service selection from `pyproject.toml` and `dev/toolchain.py` into
  `.github/workflows/test.yml`, then compare that executed set with
  `src/vaultspec_a2a/service_tests/`.
- Compare A2A's service-test gates with the separate dashboard real-capsule
  gates in `engine/crates/vaultspec-product/tests/lifecycle_ownership.rs` and
  `engine/crates/vaultspec-api/src/lib_tests/a2a_runtime_identity.rs`.
- Force the completion proof's scripted backend to an unreachable loopback port
  and run the exact focused test both normally and with
  `--require-prerequisite=docker`, using the isolated source through
  `PYTHONPATH` and disabling bytecode/cache writes.

## Outcome

**Verdict: the shared deterministic service stack is container-gated, but the
completion proof is not capsule-gated and is not currently required to execute
by CI. Fleet-wide portability remains undecided because the available fleet
record does not establish Docker Compose plus the tape backend on every target.**

`src/vaultspec_a2a/service_tests/conftest.py` makes the shared `service_stack`
fixture call `external_prerequisite("docker")` before starting the Compose-backed
stack. `src/vaultspec_a2a/service_tests/test_real_worker_run_completion.py` does
not use that fixture: it probes `MOCK_API_BASE`, defaults to
`http://127.0.0.1:8100`, and names `docker compose -f
service/docker-compose.integration.yml up -d vidaimock` as the supply command.
The completion proof is therefore container-backed by the repository's default
recipe, but not intrinsically container-only because `MOCK_API_BASE` can name an
already-running backend.

The current A2A workflow does not run this proof. `.github/workflows/test.yml`
runs the ordinary non-service gate, the `desktop_tests` package on three hosted
targets, provider-prerequisite gates, and only
`test_compose_profile_regression.py` from `service_tests` on `ubuntu-latest`.
No workflow command selects `test_real_worker_run_completion.py` or the complete
service package. A green current workflow is therefore no evidence that the
completion proof executed.

The A2A service and acceptance trees contain no reference to
`VAULTSPEC_PRODUCT_CAPSULE`, `VAULTSPEC_REQUIRE_PRODUCT_CAPSULE`,
`dist/capsules`, or a capsule gate. The passing-without-executing capsule set is
a separate dashboard Rust test set retained after the old capsule producer was
replaced by the frozen onedir. A2A's completion proof is not in that set.

It nevertheless has its own pass-without-execution path. With
`MOCK_API_BASE=http://127.0.0.1:1`, the focused command exited zero with
`1 skipped`. The same command with `--require-prerequisite=docker` also exited
zero with `1 skipped`: the test calls `pytest.skip` directly after its endpoint
probe, so the root external-prerequisite rule does not attribute that skip to
the declared Docker prerequisite. This host reported Docker Compose `v5.3.1`,
which proves the declaration itself passed while the model-chain proof did not
run.

The accepted runner-fleet record proves four native target runners and records
their scheduling and durability constraints. It does not prove that Docker
Compose and the VidaiMock tape backend are provisioned and runnable on every
target. The repository workflow proves the Compose regression only on hosted
Ubuntu. Therefore no all-target container-portability decision is made here;
the missing per-target live prerequisite evidence is a no-decision blocker.

## Notes

The first focused command used `uv run --no-sync` and could not spawn `pytest`
because the isolated checkout has no local tooling environment. The repeatable
probe used the existing A2A main worktree interpreter while pinning
`PYTHONPATH` to the isolated source; an immediate `git status --short` confirmed
that the isolated A2A checkout remained clean.

This Step records placement evidence only. It does not modify A2A, choose the
W01.P03 scenario substrate, claim fleet-wide container support, or execute
W01.P02.S05.

Formal review found no scoped findings. It confirmed that each verdict clause
maps to a named source or executed command, the no-decision boundary does not
infer unrecorded fleet capability, and the dashboard diff contains only this
Step record plus the CLI-authored S04 plan transition.
