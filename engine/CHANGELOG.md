# Changelog

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
