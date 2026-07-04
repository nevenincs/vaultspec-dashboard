---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S22'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# assess SignPath Foundation free OSS signing eligibility and record the finding in the step record (research only)

## Scope

- `.vault/exec/2026-07-04-dashboard-packaging`

## Description

- Read the local `LICENSE` and confirm the project license (MIT, Copyright 2026 Gergely Wootsch)
- Verify SignPath Foundation eligibility terms against signpath.org/terms.html
- Verify the GitHub Actions integration mechanics against docs.signpath.io/trusted-build-systems/github and public applicant reports

## Outcome

Verdict: the project PLAUSIBLY QUALIFIES for free OSS signing. MIT satisfies the OSI-license requirement (no dual-licensing, no proprietary component); a single maintainer is not disqualifying (the terms require named Author/Reviewer/Approver roles, which one person may hold); releases built by public GitHub Actions on GitHub-hosted runners satisfy the verifiable-build requirement via SignPath's GitHub connector, which cryptographically verifies artifact origin. The real lift is governance pre-work, not code: a published code-signing-policy page naming the roles and linking SignPath Foundation, a privacy statement, MFA on both SignPath and the repo, the SignPath GitHub App installed, and per-release manual signing approval. Pipeline change: build, upload the unsigned artifact, submit via the signpath github-action-submit-signing-request action with org, project, and policy slugs as secrets; every job in the chain must run on GitHub-hosted runners. Application via signpath.org/apply; reported turnaround days to weeks.

## Notes

- Deferred by the ADR to a follow-up: signing is an optional future path, not a v1 dependency; this record closes the eligibility question in the affirmative.
- The repo-identity discrepancy (origin github.com/nevenincs/vaultspec-dashboard vs metadata github.com/wgergely/vaultspec-dashboard) must be reconciled before an application, since SignPath verifies the applicant maintains the linked public repo.
- SignPath signs only the project's own source builds; bundled third-party binaries are out of scope.
