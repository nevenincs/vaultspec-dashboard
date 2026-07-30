---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-30'
modified: '2026-07-30'
body_schema: 'body-v1'
step_id: 'S185'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Reshape the a2a_component contract from the retired capsule join to the dashboard-built onedir build source, shrink the component lock to a source pin plus freeze-recipe entry identity, retire capsule_manifest and capsule_archive from the release-set schema parser and authority surface, and admit the built onedir as an ordinary digest-covered build source

## Scope

- `schemas/release-set-manifest.json`
- `packaging/a2a-component.lock.json`
- `engine/crates/vaultspec-product/src/manifest.rs`
- `engine/crates/vaultspec-product/src/manifest/authority.rs`
- `engine/crates/vaultspec-product/src/manifest/verification.rs`
- `engine/crates/vaultspec-product/src/bin/product_build.rs`

## Description

- Replaced the five capsule fields of `BuildSources` with one built-onedir DIRECTORY source carrying its source directory, its fixed app-tree destination, and the launchable entrypoint inside it.
- Placed the onedir recursively as ordinary regular files, refusing a link, a reparse object, or an empty directory at placement so the tree constraints are reported against the freeze recipe that emitted them.
- Dropped the capsule parameter from tree composition and from manifest emission, and retired the standalone-MCP carriage check with the capsule declaration it read.
- Stopped the builder CLI loading and cross-verifying a capsule manifest; it now loads only the trusted component lock.
- Reshaped the release-set member pin to carry the source commit, release identity, component-lock evidence, and a bundled-runtime declaration of root, entrypoint, and placed-file count.
- Retired the runtimes, protocol, and state-schema blocks from the member manifest, whose only sources were the base closure and the capsule compatibility ranges.
- Shrank the component lock to the source pin plus the freeze-recipe entry identity, deleting the capsule contract and the per-target CPython, Node, and ACP closure with their digest accessors.
- Narrowed the capsule-to-lock join to target and release identity, the only lock facts that survive, and documented why the closure joins retired.
- Replaced the installed-tree evidence verifier with a bundled-runtime join proving the declared entrypoint is installed, executable where the platform records a mode, and that the declared count equals the files installed under the declared root.
- Joined the authority's trusted runtime root to the root the member manifest declares, so the subtree a consumer launches from is the subtree verification covered.
- Reshaped the manifest schema block, preserving the four-target roster and its bounds, and dropped the definitions the retirement left unreferenced.
- Reshaped the build-spec assembler to pass the onedir as a directory source and to stop carrying a producer-supplied tree digest and file count.

## Outcome

The compose path is unblocked: the release pipeline can build the frozen onedir itself and hand it to the builder as an ordinary build source. Component trust is now composition-time digests, with the member manifest's installed-file inventory covering every onedir file exactly as it covers every other installed file; there is no second manifest chain to cross-verify.

Proven end to end rather than by tests alone: the real builder binary composed a real tree from a real nested onedir, placed its files as ordinary regular files, digest-covered all of them, emitted a manifest that self-verified through the production verifier, and that emitted manifest validates against the reshaped schema. The pinned source commit was carried through unchanged and deliberately not advanced.

Gates: the touched-scope suites pass at 266 tests with zero failures, and the crate is clippy-clean under deny-warnings. The pinned commit is unchanged, and the supported target set remains four.

## Notes

- Retired proofs whose subject no longer exists, rather than deleting proofs to pass: the standalone-MCP carriage check and the installed-tree digest preimage vector both lost their subject with the capsule and the evidence document. Every other proof was re-homed rather than dropped - entrypoint presence and executability, the extra-file-in-the-runtime-root refusal (now caught by the declared count instead of absent tree evidence), the artifact-join refusal matrix, and the chain proof that a manifest-link refusal leaves the journal clean and the descriptor armed, whose inducing input moved from a lock-drifted capsule to an under-declared runtime.
- One genuine coverage reduction, recorded rather than hidden: the entrypoint's executable-mode refusal is now provable only on Unix. The mode is read from the installed file instead of from a declared inventory record, and Windows records no POSIX mode.
- The capsule parser and its structural proofs were deliberately KEPT. The lifecycle plane still resolves its gateway entrypoint through that type, so retiring it outright was out of scope here; its tests now run against a local document instead of a release-tree payload.
- The bundled-runtime root accessor keeps its existing name. Renaming it would reach into the deferred distribution and cohort publication contract, which the governing decision leaves untouched.
- Two consumers were resolved by other lanes mid-flight: the real-capsule lifecycle-ownership test lost its base-closure cross-check, and a runtime-identity test remains on the capsule type. The release workflow still needs its compose gate lifted and a runtime argument passed to the assembler; that file was out of scope here.
