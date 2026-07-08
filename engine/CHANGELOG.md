# Changelog

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
