---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S19'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate clipboard actions to canonical localized verbs

## Scope

- The shared clipboard action builder and its production menu callers
- Clipboard action tests using the real localization runtime
- The exact localization scanner baseline

## Description

- Replaced arbitrary legacy clipboard labels with five approved, value-free message descriptors: generic copy, document name, path, summary, and title.
- Restricted builder ingress to those canonical copy-action keys and made missing, malformed, interpolated, non-copy, and legacy string labels fall back to generic `Copy`.
- Updated every clipboard menu caller, including disabled mirror rows, without deriving labels from copied content or telemetry.
- Kept copied text bytes, action IDs, `what` values, icons, sections, dispatch types, payloads, and disabled behavior unchanged.
- Standardized source path to `Copy path`, subject to `Copy title`, stem to `Copy document name`, and internal identifier, hash, number, JSON, relation, link, score, and result variants to the short generic `Copy` verb.
- Removed exactly 33 stale legacy action-presentation entries from the scanner baseline with no new or mismatched findings.

## Outcome

Clipboard actions now resolve through catalog keys only. Their UI no longer exposes ad hoc object terminology such as IDs, hashes, or JSON in copy verbs, while the clipboard content remains byte-for-byte unchanged. The bridge count decreased from 201 to 168, and the full scanner baseline decreased from 1,555 to 1,522.

The focused integration run passed 112 tests across six files, including menu behavior, clipboard action normalization, scanner enforcement, and real localization resolution. The complete frontend lint recipe passed ESLint, localization scanning, formatting, TypeScript, pixel and module-size checks, token drift, and Figma naming.

## Notes

Existing direct clipboard writers remain outside this step because they carry user content only and do not author action labels. An independent Sol review reported no findings and confirmed exact behavioral preservation, canonical key restriction, exact baseline shrinkage, and no new user-facing metadata, raw keys, diagnostics, or em dashes.
