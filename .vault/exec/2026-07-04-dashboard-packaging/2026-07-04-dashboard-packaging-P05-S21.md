---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S21'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# validate winget acceptance of unsigned hash-pinned manifests and record the finding in the step record (research only)

## Scope

- `.vault/exec/2026-07-04-dashboard-packaging`

## Description

- Verify winget-pkgs installer-type policy for unsigned artifacts against the installer manifest schema (github.com/microsoft/winget-pkgs, schema 1.10.0)
- Verify the validation pipeline gates (hash pin, AV scan, Defender dynamic test, URL policy) against learn.microsoft.com/en-us/windows/package-manager/package/winget-validation
- Survey submission tooling (Komac, WinGet Releaser action, wingetcreate) and precedent for unsigned Rust binaries (RustDesk rejection thread)

## Outcome

Verdict: the winget channel is VIABLE without signing. The only explicit signing mandate applies to MSIX/APPX packaging; portable `.exe` (winget-cli >=1.3) and zip (>=1.5) installer types accept unsigned binaries. Integrity rides the mandatory `InstallerSha256` hash pin against an HTTPS `InstallerURL` resolving directly to the release asset (a GitHub Releases URL qualifies; no redirectors). The real gate is the Installers Scan: several AV engines plus a Defender dynamic pass, where unsigned zero-reputation binaries are prone to false positives (precedent: RustDesk's weeks-long `Binary-Validation-Error` cleared only via a Defender false-positive submission). Submission flow: Komac or the WinGet Releaser GitHub Action watching GitHub Releases, needing only a `public_repo`-scoped PAT secret.

## Notes

- Budget a review cycle or a manual Defender false-positive submission for the first release; reputation accrues per binary and domain.
- The release artifact must install and uninstall silently for admin and non-admin, one manifest version per PR; a genuine portable binary dodges `Validation-Uninstall-Error`.
- Repo identity discrepancy flagged during research: the worktree origin is github.com/nevenincs/vaultspec-dashboard while project metadata names github.com/wgergely/vaultspec-dashboard; the manifest must point at the real public release location. Carried to the release-pipeline phase.
