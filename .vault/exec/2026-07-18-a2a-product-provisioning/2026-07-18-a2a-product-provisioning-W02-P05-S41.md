---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S41'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Accept POST /internal/a2a/run-terminal only from the gateway settlement component authenticated by the dashboard-created attach-control credential, confirm authoritative A2A status is durably terminal, idempotently record its run or thread plus non-secret lease identity, and then revoke exactly the persisted hashed bundle

## Scope

- `engine/crates/vaultspec-api/src/routes/a2a_settlement.rs`

## Description

- Added `POST /internal/a2a/run-terminal` authenticated by a REQUIRED `AttachControlAuth` FromRequestParts extractor, so the attach-control credential is enforced BY CONSTRUCTION (the extractor runs before the body; the handler cannot execute without it), constant-time compared against the stored attach-control credential.
- Rejected fail-closed with 401: the machine bearer, the worker-IPC secret, an unrelated credential, a missing header, and a malformed one.
- Mirrored the a2a producer's TerminalSettlement shape exactly; gated on durable-terminal statuses ({completed, failed, cancelled}; input_required retained); idempotent settle-once; revoked EXACTLY the persisted hashed bundle after verifying the callback lease id matched the one bound at commit; returned 200 for every settled/unknown/mismatch outcome so the fire-and-forget gateway never retry-storms.
- Backed by a lease-repo v2 ledgered migration binding the gateway-minted lease id at commit and a verifying settle_terminal.

## Outcome

The attach-control-authenticated settlement callback revokes exactly the terminating run's bundle. Gate: build + fmt + clippy --lib clean; router acceptance test proves the full auth matrix (tokenless/worker-IPC/machine-bearer all 401, attach-control accepted), terminal gating, idempotency, exact revocation, and lease-id mismatch.

## Notes

The boot/reconcile settlement-endpoint spawn-env wiring is deferred: the live gateway path additionally needs the a2a-side credential naming reconciled (the gateway reads `attach.cred` while the product CredentialStore writes `attach-control.cred`) and the credentials-dir shared — cross-repo coordination flagged for the S44 live proof. The route + auth are correct and fully tested independent of that.
