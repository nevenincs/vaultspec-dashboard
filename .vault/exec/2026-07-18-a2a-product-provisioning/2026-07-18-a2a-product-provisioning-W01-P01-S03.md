---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S03'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S03 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Pin the exact A2A source commit and release identity plus emitted capsule artifact, CPython 3.13, Node 22, and ACP 0.59.0 digests without floating, latest, or runtime resolution and ## Scope

- `packaging/a2a-component.lock.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Pin the exact A2A source commit and release identity plus emitted capsule artifact, CPython 3.13, Node 22, and ACP 0.59.0 digests without floating, latest, or runtime resolution

## Scope

- `packaging/a2a-component.lock.json`

## Description

- Authored `packaging/a2a-component.lock.json` pinning the exact A2A source commit
  `7df84b1de4455ed79895136ab085c821ce988c9a` and release identity `vaultspec-a2a`
  `0.1.0`.
- Pinned the base-closure runtimes from the A2A producer's `desktop_capsule_inputs.toml`:
  ACP `0.59.0` (Apache-2.0, one sha256), CPython `3.13.5` and Node.js `22.17.0`
  each with a per-target sha256 across all five triples.
- Referenced the A2A-owned capsule contract `schemas/desktop-capsule-manifest.json`
  and set `digest_algorithm` sha256.
- Declared a strict `resolution_policy` (floating/latest/runtime-resolution forbidden,
  digest required).

## Outcome

The dashboard now owns an exact, digest-bound pin of the A2A build and every base-closure
artifact. Verified programmatically: the A2A commit is a full 40-hex sha, the release
version is exact, all runtime versions are exact (no range/wildcard/`latest`), 11 sha256
digests are 64-hex, all five target triples carry both a CPython and a Node digest, and no
floating selector appears in any version/digest field. This is the authority substrate the
release-set schema (`S04`) and the `vaultspec-product` manifest parser (`S06`) build on.

## Notes

The emitted-capsule per-target digest is carried as a field the release-set manifest
(`S04`) binds once a target capsule is built; this step pins the source commit, release
identity, and the base-closure input digests that determinism depends on.

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
