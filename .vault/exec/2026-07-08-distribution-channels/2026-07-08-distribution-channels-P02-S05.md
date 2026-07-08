---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S05'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# seed the scoop manifest at the current release (versioned url, sha256 hash, bin, homepage, checkver github, autoupdate with the url.sha256 idiom)

## Scope

- `bucket/vaultspec.json`

## Description

- Seed `bucket/vaultspec.json` at v0.1.0: versioned zip URL, the published sha256 (fetched from the release asset), `bin: vaultspec.exe`, homepage (required by `checkver: github`), MIT license, and the `autoupdate` stanza using the documented `$url.sha256` idiom scoop's built-in bare-hex regex consumes

## Outcome

Manifest JSON validates (seeded from the live release); the bucket/ subdirectory is scoop's documented in-repo convention (`Find-BucketDirectory`).

## Notes

- None.
