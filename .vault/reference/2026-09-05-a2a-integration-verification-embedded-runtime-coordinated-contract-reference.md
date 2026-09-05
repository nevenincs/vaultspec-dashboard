---
tags:
  - '#reference'
  - '#a2a-integration-verification'
date: '2026-09-05'
modified: '2026-09-05'
body_schema: 'body-v2'
body_hash: 'sha256:7efed9e6b454e46f29622ce5e1ff1c9a890e336a65508a60832941387f4ce17e'
related:
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
  - "[[2026-07-24-a2a-product-provisioning-adr]]"
  - "[[2026-07-31-a2a-integration-verification-adr]]"
---
# `a2a-integration-verification` reference: `A2A Embedded Runtime Coordinated Contract`

## Summary

This reference fixes the cross-repository lifecycle, discovery, broker, compatibility, and release-identity contract for the Dashboard-embedded A2A runtime, records current drift, and assigns the later coordinated implementation steps.

## Purpose and authority

This is the single home for the coordinated embedded-runtime boundary resolved by A2A plan step `W01.P01.S02`. Dashboard owns product lifecycle selection, installation, launch, update, rollback, process supervision, the active component receipt, discovery consumption, and every product-facing broker call. A2A owns the launched executable, provider and worker behavior, runtime persistence and migrations, and publication of the receipt facts Dashboard passes at launch. This reference records the boundary; it does not change wire behavior.

The qualified pair at capture time is Dashboard `330b2efe294c8ab134fff2142f9fae98afd14fec` and A2A `97f8dc2478cc75338c6c77e3ba9202fa87c59454`. The current Dashboard component lock still names A2A commit `d59b41b6c1ac8b6e498326ea74ab32898ac9c08b`, release `vaultspec-a2a` version `0.1.0`; this mismatch remains an open qualification gap until the final conformed artifact is pinned.

## Resolved contract

### Lifecycle and process identity

Dashboard's component lifecycle plane is the sole authority for the embedded process. It exposes `install`, `ensure`, `start`, `stop`, `restart`, `repair`, `update`, `rollback`, `remove`, and `doctor`; jobs are single flight, retain 32 records for two hours, use 30 seconds as discovery freshness, a 5 second graceful stop plan, and a 5/600 second drain connect/maximum budget. The product broker must resolve only the product-managed gateway. It must not silently substitute the legacy resident `service.json`, and a foreign resident remains separately observable and read-only.

The component lock, release-set member manifest, active installation receipt, executable version output, launch process, and published discovery record must identify the same artifact and generation. Dashboard creates and owns the attach token and lifecycle capability files. Discovery is secret-free. A2A `/health` provides unauthenticated liveness and attach-authenticated readiness; `/admin/shutdown` requires the attach bearer and lifecycle capability. An unknown or incompatible generation is not attached to the versioned run surface. Lifecycle control against an older generation is allowed only when its receipt proves a supported control contract; otherwise Dashboard uses the process handle it owns for bounded termination.

### Discovery publication and compatibility

The embedded record is `gateway-discovery.json` under the Dashboard product application home. Dashboard supplies receipt-bound values at launch and A2A atomically publishes and refreshes this exact shape:

| Field | Meaning |
| --- | --- |
| `endpoint` | loopback HTTP endpoint |
| `pid` | launched process identifier |
| `owner` | Dashboard installation owner identity |
| `install_identity` | verified active installation identity |
| `generation` | exact active receipt generation |
| `release_set` | exact A2A member `name`, `version`, and `target` from the verified release set |
| `protocol` | supported minimum and maximum; currently `v1` through `v1` |
| `state_schema` | exact packaged migration range; currently `0001` through `0016` |
| `handoff_reference` | optional receipt-bound handoff identity |
| `heartbeat_ms` | freshness timestamp |

Dashboard validates every identity field against the active receipt before attach. Unknown protocol, migration range, release member, generation, installation identity, ownership, stale heartbeat, or PID mismatch fails closed. Additive fields require tolerant readers; changed meanings, removed fields, filename changes, or range encoding changes require a coordinated version change. The A2A legacy desktop record (`service.json`, integer schema version 1, package-derived generation, nested process/endpoint) is outside the embedded contract.

### Broker operations, envelopes, deadlines, and retries

The accepted orchestration-edge ADR's 2026-09-05 contract event is authoritative. Dashboard's engine is the sole product wire client. The exact whitelist has eleven verbs: the existing `run-start`, `run-status`, `run-cancel`, `presets-list`, `active-runs`, `provider-catalog`, and `clarification-respond`, plus `run-message`, `permission-respond`, `native-commands-list`, and `native-command-execute`. No verb is an arbitrary proxy, shell, provider RPC, or untyped prompt escape.

All browser requests use the Dashboard machine bearer, carry `expected_scope` (1..4096 characters), and accept no credential, endpoint, path, or actor token. Dashboard compares the fence to its current scope and injects that canonical root. It resolves only the receipt-joined product gateway and uses its server-held attach bearer. `run_id` matches `[A-Za-z0-9_][A-Za-z0-9_-]{0,127}`. `request_id`, `command_id`, and `idempotency_key` are 1..128 characters matching `[A-Za-z0-9_.:-]+`; command ids are percent-encoded as one segment. Unknown request fields fail before discovery.

| Engine verb | A2A method and path | Exact browser fields | Budget |
| --- | --- | --- | ---: |
| `presets-list` | `GET /v1/presets` | `expected_scope` | 15 s |
| `provider-catalog` | `GET /v1/provider-catalog` | `expected_scope` | 45 s |
| `active-runs` | `GET /v1/runs?state=active` | `expected_scope`, optional bounded `feature_tag`; Dashboard injects root and limit 2 | 15 s |
| `run-status` | `GET /v1/runs/{run_id}` | `expected_scope`, `run_id` | 15 s |
| `run-cancel` | `POST /v1/runs/{run_id}/cancel` | `expected_scope`, `run_id` | 60 s |
| `run-start` | `POST /v1/runs` | existing prepare/commit contract | 60 s |
| `clarification-respond` | `POST /v1/runs/{run_id}/clarifications/{request_id}/respond` | existing exactly-one-of answers/prompt/decline contract | 60 s |
| `run-message` | `POST /v1/runs/{run_id}/messages` | `expected_scope`, `run_id`, `content`, optional `agent_id`, `idempotency_key` | 60 s |
| `permission-respond` | `POST /v1/runs/{run_id}/permissions/{request_id}/respond` | `expected_scope`, `run_id`, `request_id`, `option_id`, optional `notes`, `idempotency_key` | 60 s |
| `native-commands-list` | `GET /v1/runs/{run_id}/native-commands` | `expected_scope`, `run_id` | 45 s |
| `native-command-execute` | `POST /v1/runs/{run_id}/native-commands/{command_id}/execute` | `expected_scope`, `run_id`, `command_id`, `session_revision`, optional `arguments`, `idempotency_key` | 60 s |

`run-message` forwards `{"content", "agent_id"?}` and the idempotency header. Content is trim-nonblank, at most 65,536 Unicode scalar values and 262,144 UTF-8 bytes. Agent id uses the run-id grammar and must be in the current authoritative run roster; omission selects the supervisor. A2A HTTP 202 success is exactly `{api_version:"v1",run_id,accepted:true,applied,action_status,action_id,idempotency_key}`. Accepted status is `accepted_not_applied`, `applied`, or `duplicate`; action and idempotency ids are non-null and form the durable dispatch receipt. Completion remains run-status truth.

`permission-respond` forwards `{"option_id","notes"?}` and the idempotency header. Option id is 1..64 characters; notes are at most 2,048 characters and 8,192 UTF-8 bytes. Dashboard first re-reads run-status and requires the exact pending request and option under that run; A2A repeats the check atomically. A2A HTTP 200 success is exactly `{api_version:"v1",run_id,request_id,accepted,applied,action_status,approval_status?,action_id,idempotency_key}`. Accepted statuses are `accepted_not_applied`, `applied`, or `duplicate`; a durably rejected attempt is `rejected_invalid_state`. The receipt retains run/request, option-bound idempotency, action, and application state.

`native-commands-list` returns HTTP 200 `{api_version:"v1",run_id,session_revision,busy,commands}`. Revision is an opaque 1..128-character token. There are at most 32 commands, each exactly `{command_id,title,description?,disposition,argument}`. Title is 1..128 characters, description at most 512, disposition one of `supported|blocked|unsupported`, and argument either `{kind:"none"}` or `{kind:"text",required,max_chars,multiline}` with max_chars 1..4096. This is session-scoped dynamic truth; an empty list is valid.

`native-command-execute` forwards `{"session_revision","arguments"?}` and the idempotency header. Arguments must satisfy the advertised descriptor and are capped at 4,096 characters and 16,384 UTF-8 bytes; Dashboard never interprets them as argv or shell text. A2A HTTP 200/202 success is exactly `{api_version:"v1",run_id,command_id,session_revision,accepted,applied,action_status,action_id,idempotency_key,effect}` with accepted status `accepted_not_applied|applied|duplicate`. Effect is `{kind:"ordinary"|"compact",status:"pending"|"completed"|"failed",before_context_tokens?,after_context_tokens?}` with nonnegative counts. Compact is completed only after an independently observed reduction.

Each mutation requires a stable idempotency key for one user intent. A2A binds it durably to the normalized payload before dispatch. Same key and payload replay the receipt; changed payload returns `idempotency_conflict`. Dashboard never blindly retries. After an ambiguous transport result it may make exactly one reconciliation replay with the same identity, key, and payload. A receipt settles the outcome; a second ambiguity returns typed `outcome_unknown` and preserves the identity. Reads may be reissued as new bounded reads.

Every A2A refusal/error is `{api_version:"v1",error:{code,message,retryable},identity:{run_id,request_id?,command_id?,idempotency_key?},receipt?}`; message is at most 512 characters. A2A codes are exactly `not_found|request_conflict|option_conflict|idempotency_conflict|busy|blocked|unsupported|invalid_arguments|invalid_state|at_capacity|provider_unavailable|internal_failure`. Bound/schema failures use 400/422; absent identity 404; stale-session/superseded-request/busy/idempotency conflicts 409; capacity/breaker 503. Every sibling success or refusal is verbatim under Dashboard `data.envelope`, with `data.sibling_status` for non-2xx and normal tiers. Dashboard-originated failures use its typed API-error envelope: `scope_conflict` at 409, `outcome_unknown` at 502 after the single reconciliation replay is inconclusive, `gateway_timeout` at 504, and `gateway_unavailable|protocol_error` at 502. Known-down is HTTP 200 with degraded agent tier. Output remains under 8 MiB.

### Producer-first release provenance

The accepted provisioning amendment governs S50. A2A first publishes deterministic, fixed-name, per-target versioned archives and a SHA-256 sidecar for each archive. Its release gate starts the packaged gateway, reaches health and readiness, stops it, and proves the process is gone before publication. Dashboard selects only the released version, fetches the matching target archive and sidecar, verifies the digest, and bundles the verified files into its release set. Dashboard does not check out A2A source, run A2A's freeze recipe, or pin an A2A source commit in the release flow. The Dashboard component lock becomes a version-only released-artifact reference.

After composition, the version-only component lock, verified release-set member and digest, active receipt, launched executable version, process identity, and discovery release/generation fields must agree. The present source-commit lock is historical drift and cannot satisfy qualification. S50 implements fetch-verify-bundle and positive packaged lifecycle/API proof after the producer workflow exists; it does not build A2A from source.

### Coordinated change boundary

`S43`-`S45` add the three missing broker capabilities in both repositories. `S47` aligns lifecycle ownership, authentication, compatibility gates, and foreign-process behavior. `S48` replaces the embedded discovery producer with the receipt-bound Dashboard schema and removes resident fallback from the product lane. `S49` hardens graceful drain and shutdown. Under the accepted provisioning ADR, A2A first publishes fixed per-target versioned archives and SHA-256 sidecars; `S50` makes Dashboard fetch, verify, and bundle that released version, replaces the source-commit lock with a version-only artifact reference, and proves the packaged lifecycle/API path. `W05.P13.S64`-`S65` supply paired runtime evidence. No runtime source is changed in this step.

## Reproducible capture

Run from the A2A repository at the commits above. The source manifest is generated with:

```powershell
@'
import dataclasses, hashlib, json, pathlib, re, subprocess
from vaultspec_a2a.desktop.contract import DesktopDiscoveryRecord, DESKTOP_DISCOVERY_FILENAME, DESKTOP_PROTOCOL_MIN, DESKTOP_PROTOCOL_MAX
from vaultspec_a2a.desktop.migration import package_migration_range
root=pathlib.Path.cwd(); dash=pathlib.Path(r'Y:\code\vaultspec-dashboard-worktrees\main')
a=(root/'src/vaultspec_a2a/lifecycle/discovery.py').read_text(); d=(dash/'engine/crates/vaultspec-product/src/discovery.rs').read_text(); b=(dash/'engine/crates/vaultspec-api/src/routes/ops/a2a.rs').read_text(); lock=json.loads((dash/'packaging/a2a-component.lock.json').read_text())
r=DesktopDiscoveryRecord(generation='0.3.0',pid=123,start_fingerprint='example-start',host='127.0.0.1',port=18000,last_heartbeat=1234567890,owner='example-owner',credential_reference=None)
out={'a2a_desktop':{'dataclass_fields':[f.name for f in dataclasses.fields(DesktopDiscoveryRecord)],'filename':DESKTOP_DISCOVERY_FILENAME,'migration':dict(zip(('base','head'),package_migration_range())),'protocol':[DESKTOP_PROTOCOL_MIN,DESKTOP_PROTOCOL_MAX],'record':r.to_dict(),'record_fields':list(r.to_dict()),'record_version':r.version},'a2a_head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'broker':{'budgets_seconds':{'control':60,'discovery':45,'read':15},'dual_resolve':'a2a_endpoint_dual' in b,'foreign_mode_guard':'AttachMode' in b,'verbs':['run-start','run-status','run-cancel','presets-list','active-runs','provider-catalog','clarification-respond']},'component_lock':{'commit':lock['a2a_source']['commit'],'release':lock['a2a_source']['release_identity']},'dashboard_discovery':{'fields':re.findall(r'^\s+pub ([a-z_]+):',d,re.M)[:10],'filename':'gateway-discovery.json','foreign_attachable':'ForeignAttachable' in d,'protocol':['v1','v1'],'state_schema':['0001','9999']},'dashboard_head':subprocess.check_output(['git','-C',str(dash),'rev-parse','HEAD'],text=True).strip(),'lifecycle':{'freshness_seconds':30,'ops':['install','ensure','start','stop','restart','repair','update','rollback','remove','doctor'],'stop_plan_seconds':5}}
raw=json.dumps(out,separators=(',',':'),sort_keys=True); print(raw); print(hashlib.sha256(raw.encode()).hexdigest().upper())
'@ | uv run --locked python -
```

This command writes only a synthetic discovery record in memory and reads the checked-out source and lock. It emits the canonical observation and digest below.

```powershell
$a2a=(Get-Location).Path
$dash='Y:\code\vaultspec-dashboard-worktrees\main'
$a2aSources=@('src/vaultspec_a2a/lifecycle/discovery.py','src/vaultspec_a2a/api/app.py','src/vaultspec_a2a/api/routes/admin.py','src/vaultspec_a2a/api/routes/gateway.py','src/vaultspec_a2a/api/schemas/gateway.py','src/vaultspec_a2a/desktop/contract.py','src/vaultspec_a2a/desktop/migration.py')
$dashboardSources=@('packaging/a2a-component.lock.json','engine/crates/vaultspec-product/src/a2a_contract.rs','engine/crates/vaultspec-product/src/discovery.rs','engine/crates/vaultspec-product/src/control.rs','engine/crates/vaultspec-product/src/gateway_drain.rs','engine/crates/vaultspec-product/src/manifest.rs','engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs','engine/crates/vaultspec-api/src/routes/a2a_lifecycle/agent_tier.rs','engine/crates/vaultspec-api/src/routes/ops/a2a.rs','engine/crates/vaultspec-api/src/routes/ops/a2a/discovery.rs')
$records=@($a2aSources|%{[ordered]@{repository='A2A';source=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $a2a $_) -Algorithm SHA256).Hash}}; $dashboardSources|%{[ordered]@{repository='Dashboard';source=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $dash $_) -Algorithm SHA256).Hash}})
$raw=$records|ConvertTo-Json -Compress
$raw
[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($raw)))
```

The stable raw manifest digest is `D8EA71BEEE91258B2EA3BA6DA4BC0CF3DFD1F62B0BFFDA98028B8B30919AE814`. Individual source digests, in command order, are:

```text
A3BF7CBABC82DA8174CFD7D110B239CA0AD228E1A189DD52438042FB35E111CC
84A409EF24A321F533852FB861CBE21C98C47461ADCCB94EF05B977B0B9E7869
994E1A3189A9F34F1A7717AB1B578BC8B8828C446207AEB98CD192FAC1AB1396
F184422F81404E7C5AA06D02EC95CED239552DDC7D64D51CB6822B83945CB3FE
1E208D9C470B089CB6893BEBCC9862996E92BD091B4C2AA15A9DB50585C971BD
34043FB2BB33F1D1D59CF7AF1CCBFF89223E66C7F26DA7B1B89F2DC1799C24E1
D26DABAD3DBE642583E93B82A80E714A2C934EFE9C02AEA513F273B2A689448B
B4EB3FC93A05FB1B83E4391F0C81D614EA8F22BAB450B2CF3CB11BDD2DFB8A1D
BA1705929C4F0B9860733D6C20AC5A41677DC571096D5B94A29550648C3C483D
72BB6E088AFF257DB56D8E80278DD408DE30BB0E9EE43E8A7103FFA6CB8BE8DF
5D4745ED163F9B8B9A8A54D4A4C9DDA9034F682F76B918A08CE38324B329D214
D43E210F67132858551AAD4C52A6DDC6789A95C8C14729BBFD2BC759E1F99025
823AE60D70CE62650AF966706303ACB0455935429FE1CE31EC952CD7FF66BF46
2FCF2F581025E310F53BB171F222E738BB20304036E504719FA53D065452AF38
387489295A6E0B4B8FDB0506E86646FC1703E9A18F21C31F70F3FC836D2A60E6
B82A5893856840EDE50874D847F07C6F4FADB803CAE371CD58E3D5C52F78D5C0
A2A1A0739DF10633EB5BA06F425EDA7022C56800DC6B8D1284C295CC6A071AB6
```

The canonical observation output is:

```json
{"a2a_desktop":{"dataclass_fields":["version","profile","generation","protocol_min","protocol_max","pid","start_fingerprint","host","port","last_heartbeat","owner","credential_reference"],"filename":"service.json","migration":{"base":"0001","head":"0016"},"protocol":[1,1],"record":{"credential_reference":null,"endpoint":{"host":"127.0.0.1","port":18000},"generation":"0.3.0","last_heartbeat":1234567890,"owner":"example-owner","process":{"pid":123,"start_fingerprint":"example-start"},"profile":"desktop","protocol":{"max":1,"min":1},"version":1},"record_fields":["version","profile","generation","protocol","process","endpoint","last_heartbeat","owner","credential_reference"],"record_version":1},"a2a_head":"97f8dc2478cc75338c6c77e3ba9202fa87c59454","broker":{"budgets_seconds":{"control":60,"discovery":45,"read":15},"dual_resolve":true,"foreign_mode_guard":false,"verbs":["run-start","run-status","run-cancel","presets-list","active-runs","provider-catalog","clarification-respond"]},"component_lock":{"commit":"d59b41b6c1ac8b6e498326ea74ab32898ac9c08b","release":{"name":"vaultspec-a2a","version":"0.1.0"}},"dashboard_discovery":{"fields":["endpoint","pid","owner","install_identity","generation","release_set","protocol","state_schema","handoff_reference","heartbeat_ms"],"filename":"gateway-discovery.json","foreign_attachable":true,"protocol":["v1","v1"],"state_schema":["0001","9999"]},"dashboard_head":"330b2efe294c8ab134fff2142f9fae98afd14fec","lifecycle":{"freshness_seconds":30,"ops":["install","ensure","start","stop","restart","repair","update","rollback","remove","doctor"],"stop_plan_seconds":5}}
```

Its UTF-8 SHA-256 digest is `AE7F890DDCD91D6AFC64151D7C62C597225CF96654427D58E2C1081041E38CA7`. The capture covers source-declared contracts and focused local tests. It excludes a released paired artifact, live provider credentials, network degradation, crash recovery, upgrades, and end-to-end Dashboard/A2A execution; those remain later acceptance evidence.
