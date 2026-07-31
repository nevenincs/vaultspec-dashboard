---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-30'
modified: '2026-07-30'
body_schema: 'body-v1'
body_hash: 'sha256:49b68fc7167116aadad5a803ec507d627617e328df8b9d05cff4e9d255bbb945'
step_id: 'S76'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Package every dashboard, updater, capsule, manifest, license, and SBOM file into the complete MSI with product receipt and uninstall semantics

## Scope

- `engine/crates/vaultspec-cli/wix/main.wxs`

## Description

- Replaced the stock single-binary package authoring, which packaged one executable out of a build output directory, with authoring compiled against an already-composed product tree.
- Gave every fixed installed file its own component fragment: the dashboard executable, the copied external updater, the release manifest, the component lock, and the bill of materials.
- Admitted the two file sets whose membership the build decides, the bundled runtime directory and the license texts, as harvested component groups carrying one component per file, and recorded the exact harvest contract that produces them.
- Made a build that forgets to name the product tree fail at compile time with a stated reason, rather than silently producing a partial payload.
- Added uninstall semantics: before any file is removed, the shipped binary is asked to stop the running seat and then to drop the product's owned generations, receipt, and credentials, both impersonating the invoking user because that state lives in the user's own application home.
- Added a durable install-provenance record naming the owning channel, the version, and the install location, keyed so the installer removes it with the product and leaves no stale provenance behind.
- Allowed downgrades, so the channel's declared downgrade path of reinstalling the prior versioned package is reachable, and made the product payload non-deselectable so no partial installation can be produced.

## Outcome

The package carries the complete product tree with per-file components, records where it came from, and cleans up both the files and the product's own state on removal.

The originating Step row still names the retired capsule. The governing decision restates that clause as a component fragment for every bundled file, and the runtime's files are ordinary bundled files now, so the authoring follows the decision rather than the stale row wording.

## Notes

This was proven by building, not by inspection. Portable toolset binaries were fetched locally, a synthetic composed tree was assembled with a nested runtime directory, both component groups were harvested, and the package compiled and linked to a real installer file. Compiling without the required tree variable was confirmed to fail loudly with the authored message.

The built package was then read back from its own tables: all ten product files present, each in its own component; thirteen components in total; the provenance values recorded under the machine registry root; both uninstall actions typed as deferred, impersonated, and return-ignoring, sequenced immediately before file removal; and the payload feature carrying the attribute that forbids deselection.

The link step reports one warning, that the product removes more than older versions of itself. It is the expected consequence of deliberately allowing downgrades and is documented in the authoring so it is not later mistaken for a defect.

The harvest commands themselves belong to the release workflow, which is another lane's file; the contract they must satisfy is recorded in the authoring rather than assumed.
