# Changelog

## [0.1.4](https://github.com/nevenincs/vaultspec-dashboard/compare/v0.1.3...v0.1.4) (2026-07-16)


### Features

* **authoring:** thread grounding related: into CreateDocument scaffold ([0c05f0d](https://github.com/nevenincs/vaultspec-dashboard/commit/0c05f0dc5fa13b12d98a1c71d9af1e0c990a2788))
* **authoring:** W01 backend — ledgered plan-step ticks + section-anchored comments plane (authoring-surface ADR D1+D2) ([dd208c0](https://github.com/nevenincs/vaultspec-dashboard/commit/dd208c0b50eb8a5921f1a437477bcf95f9449261))
* **authoring:** W04 S33 — plan-tick rollback inverse retires the V1 unavailable gate ([818776f](https://github.com/nevenincs/vaultspec-dashboard/commit/818776f3f2220a08d7334331f74ac6daeccd7f17))
* **dist:** MSI channel with a Start-Menu shortcut (single-app-runtime S22) ([5aa1536](https://github.com/nevenincs/vaultspec-dashboard/commit/5aa1536e68d050a2327a9a89264d453fb3e5a143))
* **engine:** /features serves generation-memoized feature-group coverage ([00236b7](https://github.com/nevenincs/vaultspec-dashboard/commit/00236b7c350d4d6d2d52b1abb4178ed921004011))
* **engine:** extend changeset-transition events to the durable outbox ([a7ad6f3](https://github.com/nevenincs/vaultspec-dashboard/commit/a7ad6f38d23a40ea9fe7feeab89a1b842d1a62f1))
* **engine:** publish review lifecycle events to the durable outbox ([5173858](https://github.com/nevenincs/vaultspec-dashboard/commit/5173858f47ed38e815d5b818bbcc954c598629fc))
* **engine:** serve semantic settings metadata ([a6a9b51](https://github.com/nevenincs/vaultspec-dashboard/commit/a6a9b511bad092e5cc616b88a5097782fd77adc7))
* **graph:** stale-while-refolding declared edges end edge-less graphs ([9fd6eeb](https://github.com/nevenincs/vaultspec-dashboard/commit/9fd6eeb9e648689ea8ac6f79967d0f7230798dfe))
* **picker:** rebuild the workspace picker into a production folder picker ([acee980](https://github.com/nevenincs/vaultspec-dashboard/commit/acee980bce6e3dd3697c7097b5145ac72e8a945c))
* **runtime:** seated default-port conflict falls back to ephemeral (single-app-runtime D2 robustness) ([853fec9](https://github.com/nevenincs/vaultspec-dashboard/commit/853fec9c8acf48185b39b20745099e714392cbac))
* **runtime:** starting-state discovery + bounded folder-browse route (single-app-runtime S23, S24) ([ec0267d](https://github.com/nevenincs/vaultspec-dashboard/commit/ec0267d94c06d41b16aeed9b3e971369ffc053b2))
* **runtime:** W01 seat law + lifecycle core (single-app-runtime S01-S07) ([150c0bb](https://github.com/nevenincs/vaultspec-dashboard/commit/150c0bb7d675cb6fe2755194b710d1d008f689e7))
* **runtime:** W02/W03 engine — app front door, workspace-less boot, provisioning parity, CSP, update verb (single-app-runtime S08-S13, S15-S20) ([97b6912](https://github.com/nevenincs/vaultspec-dashboard/commit/97b69126aae8512f7c31e48d7f6b441f9d2f814e))


### Bug Fixes

* **api:** drop unused imports after the boot/discovery split ([71d042f](https://github.com/nevenincs/vaultspec-dashboard/commit/71d042ffc50184179cb672ea167d875589e2f3ca))
* **engine:** materialize a whole-document create as a two-step apply ([2659e1c](https://github.com/nevenincs/vaultspec-dashboard/commit/2659e1c35a1f2d57edd95081c02678ae8707d5a6))
* **engine:** scope create-path-collision apply gate to landable siblings ([ca66181](https://github.com/nevenincs/vaultspec-dashboard/commit/ca661816a86a9a13800730073733ecbff2217309))
* **engine:** survey-bearing rag reads get their own wall-clock budget ([aff4de9](https://github.com/nevenincs/vaultspec-dashboard/commit/aff4de9d60c24fecd9366a1078f5f8dfa2896488))
* **launch:** review findings — cold-index-proof spawn wait (30s-&gt;180s), honest crash-loop message ([f997ae1](https://github.com/nevenincs/vaultspec-dashboard/commit/f997ae146934a8be0def1fe827eb5cb9c723d99e))
* **runtime:** P07 review revisions — state-aware launcher wait, starting-seat test, listbox keyboard nav ([88cb65d](https://github.com/nevenincs/vaultspec-dashboard/commit/88cb65d3ac6eb6db47197bfdaaff0df4bab4f5df))
* **runtime:** review revisions — seat-first boot, liveness-aware crash guard, raced-launch attach, CSP document proof, S20 honest split ([2061ec0](https://github.com/nevenincs/vaultspec-dashboard/commit/2061ec0dc6d30e32c51818c291d680f17c771a7e))


### Performance

* **code-files:** generation-keyed delta via the generalized row-delta core ([ca55107](https://github.com/nevenincs/vaultspec-dashboard/commit/ca551073e4ecacc24a48dd066a09189f9541ef6e))
* **git:** engine-computed changes summary; detail fetch pays only on fold-open ([1aba7d9](https://github.com/nevenincs/vaultspec-dashboard/commit/1aba7d99e72035571717d45b6e6bb9f134b8e53e))
* **graph:** generation-keyed slice delta kills the idle refetch storm ([e6d087d](https://github.com/nevenincs/vaultspec-dashboard/commit/e6d087dd3cebab8143e5a4b73f15bdcd7af6b3a5))
* **vault-tree:** generation-keyed delta reconciliation (vault-tree-delta ADR) ([241fbc2](https://github.com/nevenincs/vaultspec-dashboard/commit/241fbc29bfa09b876b4cb9fcdc9aa05fc27f739c))

## [0.1.3](https://github.com/nevenincs/vaultspec-dashboard/compare/v0.1.2...v0.1.3) (2026-07-11)


### Features

* **authoring:** section-scoped operations (SectionEdit) — implements W13.P45 ([83e6355](https://github.com/nevenincs/vaultspec-dashboard/commit/83e6355387f8d9a5199acd0261b8baa4f694f439))


### Bug Fixes

* **authoring:** fence-delimiter tracking + reject stray section_selector (review nits) ([9c11ec2](https://github.com/nevenincs/vaultspec-dashboard/commit/9c11ec27a15e4166e3df93df31dfa032fc8f3ffb))

## [0.1.2](https://github.com/nevenincs/vaultspec-dashboard/compare/v0.1.1...v0.1.2) (2026-07-10)


### Features

* **authoring:** drive transcript compaction from the prompt-turn boundary (W14.P42a S262) ([a773afc](https://github.com/nevenincs/vaultspec-dashboard/commit/a773afc3b841c586d4b152882a37b83f6b51eda4))
* **authoring:** echo the created-document identity in the apply receipt (ledgered-edit W03.P09a backend) ([98cc0cf](https://github.com/nevenincs/vaultspec-dashboard/commit/98cc0cf7360323cee62098b9efc908e4922327b0))
* **authoring:** explicit rebase + replacement-proposal routes (W14.P42a S260) ([8afa76d](https://github.com/nevenincs/vaultspec-dashboard/commit/8afa76dab446893470b934b1cc5aa55bad6022ae))
* **authoring:** generalize the propose surface to every content kind (ledgered-edit W02.P05a) ([f5cd34f](https://github.com/nevenincs/vaultspec-dashboard/commit/f5cd34fbda4c9ae846f2eaea6a6edb48abaff326))
* **authoring:** operation-typed direct-edit route + scope-pin (ledgered-edit W02.P06) ([1eb432d](https://github.com/nevenincs/vaultspec-dashboard/commit/1eb432db5d7cf73d3644c46bf2ee3438e10c7c76))
* **authoring:** review-station routes + Edit/Respond flip (W14.P42a S261) ([9d8da8a](https://github.com/nevenincs/vaultspec-dashboard/commit/9d8da8ad2b2952960e11c64deab20c8a7e6256d2))
* **authoring:** structured denial_kind discriminator on the direct-write outcome (ledgered-edit W05.P14 backend) ([851a98e](https://github.com/nevenincs/vaultspec-dashboard/commit/851a98e2420a51b2b5534e37041c70534de2acb9))
* **authoring:** wire CreateDocument apply + identity-bearing post-verify (ledgered-edit W02.P05) ([e852d21](https://github.com/nevenincs/vaultspec-dashboard/commit/e852d21a99bcbe75ebc9aa2ad247ec0098bd116f))
* **authoring:** wire EditFrontmatter apply/materialize/conflict/rollback (ledgered-edit W02.P03) ([a6bffe6](https://github.com/nevenincs/vaultspec-dashboard/commit/a6bffe6d59e6a19cc9c59d4c2223f0442e8d23b6))
* **authoring:** wire Rename apply/materialize/conflict + rename-back rollback (ledgered-edit W02.P04) ([5769961](https://github.com/nevenincs/vaultspec-dashboard/commit/5769961522cdef4457974ed607e0cb5d9eef3f3e))
* **provision:** project provisioning + framework acquisition plane ([e68d15e](https://github.com/nevenincs/vaultspec-dashboard/commit/e68d15e47bab8899a69ef31acba07590931c650e))


### Bug Fixes

* **authoring:** bound the compaction-run audit table (W14.P42a S262 revision) ([9233723](https://github.com/nevenincs/vaultspec-dashboard/commit/92337239c072a0cf54af1f1d50fceca82273c34c))
* **authoring:** kind-gate the crash-recovery post-verify for core-authoritative writes (ledgered-edit W02.P03 revision) ([c8d2467](https://github.com/nevenincs/vaultspec-dashboard/commit/c8d24673679cf231eb3a98fc678e34c8a3db71d5))
* **authoring:** lineage-guard rename-back rollback against stem reuse (ledgered-edit W02.P04 revision) ([c1e108d](https://github.com/nevenincs/vaultspec-dashboard/commit/c1e108d772f138643be813f2ba76035ed37cd51b))
* **authoring:** sanitize record_json in the v19 migration + add populated round-trip test (W14.P47 revision) ([b980a3b](https://github.com/nevenincs/vaultspec-dashboard/commit/b980a3b40bdc01149bd20c3e5d84e170b52d57b0))
* **authoring:** scope-pin must compare against scope_token, not scope_id_for_worktree (ledgered-edit W02.P06 follow-up) ([5cc5db8](https://github.com/nevenincs/vaultspec-dashboard/commit/5cc5db8f0eddcc648e198afe937966b0c25b0ab0))

## [0.1.1](https://github.com/nevenincs/vaultspec-dashboard/compare/v0.1.0...v0.1.1) (2026-07-08)


### Features

* **authoring:** advisory fence admits absent token + serve/gate conflicts (W14.P42a S258 revision + S259) ([c3ac5ca](https://github.com/nevenincs/vaultspec-dashboard/commit/c3ac5cae65914083e77f2196e94d12e6d234c036))
* **authoring:** advisory lease routes + apply-time fencing (W14.P42a S258) ([9fbc9d0](https://github.com/nevenincs/vaultspec-dashboard/commit/9fbc9d0953303f3a4360b5f588ec977c4915cf44))
* **authoring:** advisory leases and fencing tokens (W13.P26) ([05ab154](https://github.com/nevenincs/vaultspec-dashboard/commit/05ab15490c0f7aacf3288f5a0711bb62b23abc98))
* **authoring:** authorization engine and scope guards (W13.P20) ([4096ac3](https://github.com/nevenincs/vaultspec-dashboard/commit/4096ac3163eea902ad788dc6b32aca3d1fbc905d))
* **authoring:** explicit rebase and supersession commands (W13.P28) ([0caf87d](https://github.com/nevenincs/vaultspec-dashboard/commit/0caf87d751a79f9c177dbcf8a8b1463cc7098b6e))
* **authoring:** review-station queues and provenance audit (W13.P24) ([b986a2c](https://github.com/nevenincs/vaultspec-dashboard/commit/b986a2c05f4ad9ce613c2a5cc283b4fb46ac601f))
* **authoring:** surface the raised interrupt_id on /execute + P41 exit-gate fixture ([711681c](https://github.com/nevenincs/vaultspec-dashboard/commit/711681c20c5a61c0754b726838e579508b384916))
* **authoring:** tool-permission decision + interrupt-resume routes (W12.P41 A2) ([6642ea8](https://github.com/nevenincs/vaultspec-dashboard/commit/6642ea8f46899653cd643dc4ce6378cade90308d))
* **authoring:** W13.P27 base-revision conflict detection ([98d019e](https://github.com/nevenincs/vaultspec-dashboard/commit/98d019ebf75bab13a7f59e30bdb3697fcfd9b3b1))
* **authoring:** wire the agent-tool executor to POST /execute (W12.P41 A3b) ([495f025](https://github.com/nevenincs/vaultspec-dashboard/commit/495f0256d945bea29e27af05f86339afb4e482d0))
* **authoring:** wire the authorization floor into the command routes (W14.P42a S257) ([ec86e25](https://github.com/nevenincs/vaultspec-dashboard/commit/ec86e252528f6c3eed42b72fd81b975b53668617))
* **packaging:** boundary-clean embed — SPA staged inside the api crate (distribution-channels P01.S01-S04) ([3c65b72](https://github.com/nevenincs/vaultspec-dashboard/commit/3c65b72c13052583c954a0dd1ac581356136ac62))


### Bug Fixes

* **authoring:** effectively-once re-drive, collision-free interrupt id, lazy expiry (W12.P41 A3a) ([e8e3bb9](https://github.com/nevenincs/vaultspec-dashboard/commit/e8e3bb9f1aea617e15b322783e5042bdee939240))
* **authoring:** require P28 colon-terminated token in lineage parse — no false provenance link (W13.P24-R1) ([fddbcf4](https://github.com/nevenincs/vaultspec-dashboard/commit/fddbcf4fd1b3f8045ad6b46787b9f15136f9cc86))
* **authoring:** server-authoritative scope for the document-scope guard (W14.P42a) ([b5e6206](https://github.com/nevenincs/vaultspec-dashboard/commit/b5e620615915810dc07e86d5d0d8a2672bf72296))
* **tests:** authoring suites carry the server-authoritative scope token (W14.P42a scope guard) ([fcb01a4](https://github.com/nevenincs/vaultspec-dashboard/commit/fcb01a4cfab81f9ed9a449467b965808d0e5e4f0))
* **tests:** langgraph fixture carries the server-authoritative scope token (W14.P42a scope guard) ([b4c4ac2](https://github.com/nevenincs/vaultspec-dashboard/commit/b4c4ac24b7c6066bb168333eeeefdbd5e0e85de6))
