# Changelog

## [0.1.9](https://github.com/nevenincs/vaultspec-dashboard/compare/v0.1.8...v0.1.9) (2026-08-30)


### Features

* **ci:** acquire the published binary and prove the loader accepts it ([#63](https://github.com/nevenincs/vaultspec-dashboard/issues/63)) ([d42ae8d](https://github.com/nevenincs/vaultspec-dashboard/commit/d42ae8d203cff1f879099cba7d2945356c54f4fd))


### Bug Fixes

* **product:** name the whole path when a composed file is not portable ([#59](https://github.com/nevenincs/vaultspec-dashboard/issues/59)) ([4e908a4](https://github.com/nevenincs/vaultspec-dashboard/commit/4e908a4e7965f18ea1975b10483239589ce6f09b))
* **release:** pin the Linux glibc floor instead of inheriting it ([#60](https://github.com/nevenincs/vaultspec-dashboard/issues/60)) ([89e08b8](https://github.com/nevenincs/vaultspec-dashboard/commit/89e08b87d1b2898afc83fe9b710cf2a671430dbb))

## [0.1.8](https://github.com/nevenincs/vaultspec-dashboard/compare/v0.1.7...v0.1.8) (2026-08-30)


### Bug Fixes

* **release:** host the guard, which must work when the fleet does not ([#51](https://github.com/nevenincs/vaultspec-dashboard/issues/51)) ([fe4f6cd](https://github.com/nevenincs/vaultspec-dashboard/commit/fe4f6cd1c846ed7e518b9f6efba4bc43805fc7d1))

## [0.1.7](https://github.com/nevenincs/vaultspec-dashboard/compare/v0.1.6...v0.1.7) (2026-08-30)


### Bug Fixes

* **release:** a blind preflight must not refuse a release ([#43](https://github.com/nevenincs/vaultspec-dashboard/issues/43)) ([a923a2a](https://github.com/nevenincs/vaultspec-dashboard/commit/a923a2a711781baf4c54fb0969bc165d036a8f7f))
* **release:** keep the toolchain reachable, and stop the dist cache failing silently ([#47](https://github.com/nevenincs/vaultspec-dashboard/issues/47)) ([0f8efbf](https://github.com/nevenincs/vaultspec-dashboard/commit/0f8efbf9c724962d72cdcc961dd82591da6afcb6))
* **release:** probe the path the installer needs, not its parent ([#45](https://github.com/nevenincs/vaultspec-dashboard/issues/45)) ([83ede0b](https://github.com/nevenincs/vaultspec-dashboard/commit/83ede0b980f9fca6be92f1960761822545d006d5))
* **release:** put the build backstops in the workflow that actually runs ([#44](https://github.com/nevenincs/vaultspec-dashboard/issues/44)) ([4fd595b](https://github.com/nevenincs/vaultspec-dashboard/commit/4fd595bb09cb925f7efcd60535620d5492edde5a))
* **release:** scope release-please to the repo, like core and rag ([#48](https://github.com/nevenincs/vaultspec-dashboard/issues/48)) ([8bdbfe7](https://github.com/nevenincs/vaultspec-dashboard/commit/8bdbfe73073ba734d9d118c800045f10afbfcd22))

## [0.1.6](https://github.com/nevenincs/vaultspec-dashboard/compare/v0.1.5...v0.1.6) (2026-08-29)


### Bug Fixes

* **product:** widen st_mode before masking so the macOS legs compile ([#40](https://github.com/nevenincs/vaultspec-dashboard/issues/40)) ([ff75a70](https://github.com/nevenincs/vaultspec-dashboard/commit/ff75a70ae66e861f1e291eabaabe296fc5e24f1a))

## [0.1.5](https://github.com/nevenincs/vaultspec-dashboard/compare/v0.1.4...v0.1.5) (2026-08-29)


### Features

* **a2a-edge:** serve the clarification contract events at the engine boundary ([427aadd](https://github.com/nevenincs/vaultspec-dashboard/commit/427aaddb9c51f36bfd2dd2615ee9b3e4ecd66b7b))
* **a2a:** broker provider catalog selections ([12f7de9](https://github.com/nevenincs/vaultspec-dashboard/commit/12f7de9796d5c0bfea44c814ea2af5e59a4ba8c1))
* **a2a:** carry the clarification continuation through the broker ([184caa8](https://github.com/nevenincs/vaultspec-dashboard/commit/184caa832325e0fdc78969cb4ca25e12e454a01b))
* **a2a:** carry the clarification decline through the broker ([8d638f4](https://github.com/nevenincs/vaultspec-dashboard/commit/8d638f42818a58de726297718e34a171bfd92878))
* **a2a:** serve lifecycle eligibility instead of deriving it in the browser ([cf42b10](https://github.com/nevenincs/vaultspec-dashboard/commit/cf42b108aeb86dadca7f16a668b7ef85dbce3ada))
* **agent:** give every refusal member copy that names its own remedy ([c4f5f00](https://github.com/nevenincs/vaultspec-dashboard/commit/c4f5f0058be7c593f1303d3d90dec7dfd926368a))
* **approval-shape-reconciliation:** delete the dead review-authority branch ([7ea3447](https://github.com/nevenincs/vaultspec-dashboard/commit/7ea3447d2ad2015c46c85a30dc1074c02a572a79))
* **approval-shape-reconciliation:** enforce the destructive human floor (W01.P02) ([1da89db](https://github.com/nevenincs/vaultspec-dashboard/commit/1da89db98d2d303bc22eb3c13760ac578395f97d))
* **approval-shape-reconciliation:** strip session_override end to end (W01.P03) ([0228347](https://github.com/nevenincs/vaultspec-dashboard/commit/0228347fd1f8e21d436ecf5ec89eb9be68b1d28e))
* **authoring:** give a failed run a machine-readable provider condition ([aeb836e](https://github.com/nevenincs/vaultspec-dashboard/commit/aeb836eaa08e03bd2c91ed22d884f978dc05c695))
* **authoring:** record the settled provider condition on the failed run ([33c123f](https://github.com/nevenincs/vaultspec-dashboard/commit/33c123f74ecb1e37e0ff0befe790087f4cba3fb3))
* **authoring:** refuse a provider condition the vocabulary does not name ([190cbb7](https://github.com/nevenincs/vaultspec-dashboard/commit/190cbb7c5ac38761517edfbc5b3f1eb45cb4329c))
* **cli:** vaultspec verify-release — the shipped installer placement-integrity verb (W04.P09) ([31b6e9d](https://github.com/nevenincs/vaultspec-dashboard/commit/31b6e9d7aafe97976348366509af9e387687218a))
* **dev-harness:** collapse the justfile onto a stdlib dev/ runner ([6398b9c](https://github.com/nevenincs/vaultspec-dashboard/commit/6398b9c7c705d6fd329187ec6bd3b9aa923735da))
* **distribution:** drop x86_64-apple-darwin — four-target release set ([ed2f833](https://github.com/nevenincs/vaultspec-dashboard/commit/ed2f8338d163a37bb8906e27fd4385be71c79e88))
* **distribution:** harden capability-held datastore directories relatively ([95070f5](https://github.com/nevenincs/vaultspec-dashboard/commit/95070f556000284f39579900caecbb1cb0854463))
* **distribution:** harden persisted datastore files on their own creation handles ([ad20634](https://github.com/nevenincs/vaultspec-dashboard/commit/ad2063464937a76f379cf6d59c8ad73f2e3680c2))
* **distribution:** MaterializationSource — the sealed sync seam from verified release to materializer ([4ae471e](https://github.com/nevenincs/vaultspec-dashboard/commit/4ae471e3ce4a01c6e8146511eb701a44fd917067))
* **distribution:** owner-private publication staging on Windows (S11 Stage 5, publication half) ([940dc7d](https://github.com/nevenincs/vaultspec-dashboard/commit/940dc7d0f36107d1eeb4cd535f66dd43383cf387))
* **distribution:** retire the Windows platform gate; pin the flush access-rights boundary ([d8c5f6f](https://github.com/nevenincs/vaultspec-dashboard/commit/d8c5f6f01f1710fed5acae3694f02407340d1db6))
* **distribution:** unsealed-verify test seam + production-graph purity check (S11 Stage 1) ([a996c19](https://github.com/nevenincs/vaultspec-dashboard/commit/a996c1970bca01f12d6cad386a720d5d5fafd953))
* **engine:** broker the search-service quiesce and served-search ledger ([4ed6d8b](https://github.com/nevenincs/vaultspec-dashboard/commit/4ed6d8b6b532a0999fd93956cd067f9773782edb))
* **file-tree:** serve ignore provenance and git status per entry (P01) ([dcf93ff](https://github.com/nevenincs/vaultspec-dashboard/commit/dcf93ff4c47f35059bd32c7d4553e3fc862496cd))
* **generation:** enforce the Unix bind/verify serialization corollary ([93fe8b4](https://github.com/nevenincs/vaultspec-dashboard/commit/93fe8b4128cd603cbec0678a290f585b77b16b08))
* **msi:** package the complete product tree instead of a bare binary ([32ab753](https://github.com/nevenincs/vaultspec-dashboard/commit/32ab7531b983a22345c6ac0314d055fcbe7de608))
* **packaging:** assemble the build spec from the built onedir ([5fe78e9](https://github.com/nevenincs/vaultspec-dashboard/commit/5fe78e9b9d00c4713149352851a2ad2f5c5c0ffe))
* **packaging:** complete install, verify, receipt, update, and remove on macOS and Linux ([63a6eb9](https://github.com/nevenincs/vaultspec-dashboard/commit/63a6eb9c2c59fd4baac2f6fe3236b82f15bc9bce))
* **product:** add gated A2A contract checker ([5fb342d](https://github.com/nevenincs/vaultspec-dashboard/commit/5fb342d42cbef8bb0bc79b984298c47c0ae4c1be))
* **product:** add the real-artifact product certifier ([a745264](https://github.com/nevenincs/vaultspec-dashboard/commit/a7452646d2ce97c539d492d3f8bf92c9626cdde1))
* **product:** assert_cold_stopped — the proceed-cold quiescence mint, plus the no-force-kill policy record ([43984a0](https://github.com/nevenincs/vaultspec-dashboard/commit/43984a0394a9929f4af260d3566c73e690bf314e))
* **product:** certify owner-matched stale-discovery quarantine ([10e3dc6](https://github.com/nevenincs/vaultspec-dashboard/commit/10e3dc61039eb576228f2b51cb5b6a3fba33bcd5))
* **product:** certify readiness, admission, attachment, and the release-set transaction ([f60ec7f](https://github.com/nevenincs/vaultspec-dashboard/commit/f60ec7f9ac338b4278256b2ff75cbc6c196ebf7d))
* **product:** certify runtime singleton, single-flight ensure, and credential separation ([3dcc343](https://github.com/nevenincs/vaultspec-dashboard/commit/3dcc3439e64102111d026d96db7363dd476d987c))
* **product:** certify the frozen runtime's real dispatch, not its construction ([6a2aedd](https://github.com/nevenincs/vaultspec-dashboard/commit/6a2aedd6aa59f2f0968ec43c94682697cf350ff4))
* **product:** compose the bundled a2a runtime from a built onedir ([076f214](https://github.com/nevenincs/vaultspec-dashboard/commit/076f214d5a5c9306f58f0542bb66710863eda972))
* **product:** derive the first-install bootstrap fact from proof, not a bool (S11 Stage 2) ([b8d0ae4](https://github.com/nevenincs/vaultspec-dashboard/commit/b8d0ae4886369b5f74cf24123ab489de67911e02))
* **product:** deterministic interruption recovery (W03.P06.S53) ([1f98d49](https://github.com/nevenincs/vaultspec-dashboard/commit/1f98d49e61a9979328abbd2090ed75c70783d2f5))
* **product:** drain-by-discovery — the copied updater stops a gateway it never spawned ([73541f0](https://github.com/nevenincs/vaultspec-dashboard/commit/73541f0f6d17f4d7421afc2ff68175f2bb6b9d8e))
* **product:** enforce the file_digests completeness law at build time (W04.P08.S64/S65) ([f52f7c5](https://github.com/nevenincs/vaultspec-dashboard/commit/f52f7c5f239fce3b1cc024063c59131b86cb8ce1))
* **product:** keep ownership when our own gateway is range-incompatible ([6a76a9b](https://github.com/nevenincs/vaultspec-dashboard/commit/6a76a9b646e2d280332ed12841774bc5348dff39))
* **product:** mark_accepted — the clean Accepted terminal for the updater ([0628645](https://github.com/nevenincs/vaultspec-dashboard/commit/0628645080d3563125eb59f588f138fdf1179245))
* **product:** ordered durable update transaction (W03.P06.S52) ([d6afc4b](https://github.com/nevenincs/vaultspec-dashboard/commit/d6afc4bea0156e5a0a6970a7533889a2417864d8))
* **product:** swap the P07 handoff write to the real owner-restricted DACL (S60) ([095ba29](https://github.com/nevenincs/vaultspec-dashboard/commit/095ba29da023c604acab1bb8ff07481af7b5fa77))
* **product:** the archive→generation materializer — verified bytes become the receipt-selected release ([dd37164](https://github.com/nevenincs/vaultspec-dashboard/commit/dd37164d505a57311a33bb4ed02e7457ca854cad))
* **product:** the cohort-digest CLI bin (W04.P08.S166) ([c69880b](https://github.com/nevenincs/vaultspec-dashboard/commit/c69880b1f5375f73d4d5856da4c7b07090c2f1a6))
* **product:** the composed-tree scanner — real file_digests evidence (W04.P08.S64 b) ([ce215f1](https://github.com/nevenincs/vaultspec-dashboard/commit/ce215f1ebb4c92abf176374eb5fe21b4106c3bef))
* **product:** the product-build CLI over compose_product_tree (W04.P08.S64) ([6139304](https://github.com/nevenincs/vaultspec-dashboard/commit/61393046d9ff15db7d9d5f63756779c281eb8762))
* **product:** the product-tree composer — place, scan, assemble, emit, cover (W04.P08.S64) ([3176cbb](https://github.com/nevenincs/vaultspec-dashboard/commit/3176cbbb4db7d5e16ef6b3de52d4c29d0f551e0e))
* **product:** the release-set member-manifest emitter (W04.P08.S64/S65) ([17bc0c3](https://github.com/nevenincs/vaultspec-dashboard/commit/17bc0c32267880604f36d8202f9840e342ba44b4))
* **product:** the S166 cohort-digest emitter (W04.P08.S166) ([1d6e57f](https://github.com/nevenincs/vaultspec-dashboard/commit/1d6e57ffed0de1ccd916c1733ad54d9475891a6a))
* **product:** the sealed first-install ProvisioningTransaction (S11 Stage 3) ([589e401](https://github.com/nevenincs/vaultspec-dashboard/commit/589e401ef572e29244f5e19956a49a5e0b5996b7))
* **product:** un-gate Windows credential bootstrap on the D9 private-file authority (D6) ([44e96af](https://github.com/nevenincs/vaultspec-dashboard/commit/44e96af13dd14afdbed352637ed5a47c77eda534))
* **product:** verify the capsule carries a standalone MCP entrypoint (W04.P08.S87) ([8500fc6](https://github.com/nevenincs/vaultspec-dashboard/commit/8500fc63553c99ff7b9b1d68cd4d4eff2aaa3a55))
* **product:** verify_installed_tree — the installer's placement-integrity check (W04.P09) ([49353b1](https://github.com/nevenincs/vaultspec-dashboard/commit/49353b17f8c296eb4da51fb68aef155997fe05fb))
* **roster:** serve type_counts, plan_state rollup, and adr date span (S01) ([3b4f0ad](https://github.com/nevenincs/vaultspec-dashboard/commit/3b4f0ad241c8396280886014f732bbd587c2b337))
* **update:** hand the release transaction to the copied external updater ([668715e](https://github.com/nevenincs/vaultspec-dashboard/commit/668715e2907089a2ea84b04c309ba9d5e98ba817))
* **updater:** activate_and_accept — the injected-seam swap tail (W03.P07) ([79e220c](https://github.com/nevenincs/vaultspec-dashboard/commit/79e220c3d4e057492c771a8de94f5ea3d43466cc))
* **updater:** declare the copied external updater crate (W03.P07.S57) ([ea91323](https://github.com/nevenincs/vaultspec-dashboard/commit/ea91323f2af1b25bbc09661a290278f5b24be319))
* **updater:** executable entrypoint — one descriptor operand, bounded classify (W03.P07.S59) ([093afbd](https://github.com/nevenincs/vaultspec-dashboard/commit/093afbd59e24ea383b44e978985043001c7fd667))
* **updater:** testable runner — descriptor, lock, recover, one-time retire (W03.P07.S58) ([b620911](https://github.com/nevenincs/vaultspec-dashboard/commit/b6209119384cf9c777c94bbb3aed58b5bf57cbf7))
* **updater:** the dashboard-side handoff — copy-out + gated-stub owner-restricted write (W03.P07 S60) ([3e00aae](https://github.com/nevenincs/vaultspec-dashboard/commit/3e00aae8b308a91368e5c2d958e9b4e13e3a8705))
* **updater:** the descriptor execute-intent schema + builder (W03.P07) ([8ae314d](https://github.com/nevenincs/vaultspec-dashboard/commit/8ae314dab0b3da28cda1f9ac73a3c370c92fec41))
* **updater:** the main fresh-update flow — verify-before-drain, then the swap tail (W03.P07) ([74ae339](https://github.com/nevenincs/vaultspec-dashboard/commit/74ae339bdbaea6b926c8ad3c3c1f98f746aa71a1))
* **updater:** the relaunch + health-probe seam — the inverse of require-absent (W03.P07) ([4d29c76](https://github.com/nevenincs/vaultspec-dashboard/commit/4d29c769608974669eb25218637a70678efd0ab7))
* **updater:** wire the cold-drive branch; execute_update returns the ready token (W03.P07) ([630c2d8](https://github.com/nevenincs/vaultspec-dashboard/commit/630c2d80f8f444e6a8761680ee237eefa7b6e1a9))
* **updater:** wire the fresh-update EXECUTE drive over the drain seam (W03.P07) ([3f2c5e1](https://github.com/nevenincs/vaultspec-dashboard/commit/3f2c5e15d0e114e28b3fdeb12dd0d34b82764811))
* **visual-review:** engine-served demo conditions behind an opt-in env gate ([c61e1e8](https://github.com/nevenincs/vaultspec-dashboard/commit/c61e1e864b1a140e2be082af62fccea1e0c545f3))
* **windows-authority,distribution:** implement Windows directory-metadata durability (W01.P01.S177) ([ca509f1](https://github.com/nevenincs/vaultspec-dashboard/commit/ca509f1e638efd26da27a3c2028bd953d4c4d1f1))
* **windows-authority:** parent-relative hardening and observation constructors ([e0f10bf](https://github.com/nevenincs/vaultspec-dashboard/commit/e0f10bf0e6961b9a79c1febca2b253e87bd88680))
* **windows-authority:** parent-relative private-FILE constructors ([d86d4d1](https://github.com/nevenincs/vaultspec-dashboard/commit/d86d4d123599be3a2b0c8e6ff6436d935feb0352))
* **windows-authority:** purpose-split private-file rights + SE_DACL_PROTECTED observation (D9) ([5dc522d](https://github.com/nevenincs/vaultspec-dashboard/commit/5dc522dba562239b02acd9c8d58dd928cf248865))
* **windows-authority:** read-only directory observation authority + consumer cutover ([ad9c05b](https://github.com/nevenincs/vaultspec-dashboard/commit/ad9c05b034617c78a7321044dd94fceb7b19811c))
* **windows-authority:** the materializer child-file primitives — fenced create-new + handle-relative no-replace install ([390670d](https://github.com/nevenincs/vaultspec-dashboard/commit/390670d9b5a3b03ed38a3c09a0d7cdbb74c0058d))


### Bug Fixes

* **a2a-edge:** let the agent tier describe the plane it actually reaches ([8007e11](https://github.com/nevenincs/vaultspec-dashboard/commit/8007e11a56faab330381bbd4c4962f45bbbe66da))
* **a2a-edge:** reconcile the clarification boundary against a2a's landed route ([9aa5648](https://github.com/nevenincs/vaultspec-dashboard/commit/9aa5648c95dba2764c370c2703a0dc42bda854e4))
* **a2a:** admit a selection-less run-start until the sibling serves the catalog ([a8cf617](https://github.com/nevenincs/vaultspec-dashboard/commit/a8cf61729b1299e2abe6dd1864f8bed0c80d466c))
* **a2a:** ask the owned gateway to stop before killing its tree ([3985d3a](https://github.com/nevenincs/vaultspec-dashboard/commit/3985d3a08131c32cd245554458aa3141eb1aaae1))
* **a2a:** bring the clarification bounds back to what a2a actually serves ([1a513b3](https://github.com/nevenincs/vaultspec-dashboard/commit/1a513b3450894134db9e6e1fcd354c9e7d9672d6))
* **a2a:** budget the provider catalog for the discovery it performs ([3d9c62e](https://github.com/nevenincs/vaultspec-dashboard/commit/3d9c62e1a283c3b79823f9fae3305232b99dfca4))
* **a2a:** classify discovery under the held guard, and start only a proven tree ([543797e](https://github.com/nevenincs/vaultspec-dashboard/commit/543797e0a6212371a46a798518ce9754f30eec40))
* **a2a:** complete the selection-less run-start admission the race dropped ([6a610f1](https://github.com/nevenincs/vaultspec-dashboard/commit/6a610f106cdc1efa85d62f8676a00634c411fcb8))
* **a2a:** forward the engine machine bearer in the provisioned run bundle ([1370403](https://github.com/nevenincs/vaultspec-dashboard/commit/1370403db639f07a0e71f2d67c23b51468f8fb9e))
* **a2a:** give the continuation prompt the run-message posture ([e872b21](https://github.com/nevenincs/vaultspec-dashboard/commit/e872b2126f3215ce8f98e4982b5932dc6550c580))
* **a2a:** give the shared selection fixture the field it now carries ([e005823](https://github.com/nevenincs/vaultspec-dashboard/commit/e0058237d3ce8c717d47f608437f14ffb363e309))
* **a2a:** land the selection field its validator already guards ([3feac1e](https://github.com/nevenincs/vaultspec-dashboard/commit/3feac1e7af4f04779c0acf0233c872bfed78a53f))
* **a2a:** return the raced-in schema-version guard to its owning lane ([06d2c6e](https://github.com/nevenincs/vaultspec-dashboard/commit/06d2c6e550498f15ca96dc134752fb9557842839))
* **a2a:** settle the LIVE run lease, not a revoked retry predecessor ([7c2b6b2](https://github.com/nevenincs/vaultspec-dashboard/commit/7c2b6b21fad0c5bae13819c43b814b9d80a25bb6))
* **a2a:** stop discarding whether the gateway was actually asked to stop ([6fa9185](https://github.com/nevenincs/vaultspec-dashboard/commit/6fa91855cf26e9174225e34613a0a0f827ccccff))
* **agent-panel:** hold the clarification caps to the numbers a2a enforces ([7d02c71](https://github.com/nevenincs/vaultspec-dashboard/commit/7d02c7101bbed5c202d1465858e6901c51a64f2c))
* **agent-panel:** reconcile the clarification contract to the served wire ([69903fc](https://github.com/nevenincs/vaultspec-dashboard/commit/69903fcaa372cf6ce871865f58691de359f4793b))
* **api:** one bounded child runner that always drains stderr ([804c619](https://github.com/nevenincs/vaultspec-dashboard/commit/804c619441908fa215ec7381079b310c1da2eb68))
* **approval-shape-reconciliation:** served policy JSON + W01.P02 bookkeeping ([88ec4d5](https://github.com/nevenincs/vaultspec-dashboard/commit/88ec4d5244975bae0e91558d6f09b335f7b6d8a0))
* **cli:** classify a2a discovery under the install lock before remove ([9135d57](https://github.com/nevenincs/vaultspec-dashboard/commit/9135d5722b987171a6e2a56a2b2842672fb5e5e2))
* **corpus:** an absent .vault directory is empty membership, not an I/O fault ([c37fd7e](https://github.com/nevenincs/vaultspec-dashboard/commit/c37fd7ee2ec6de9288f0f36db040688b1d6f5140))
* **distribution-authority:** keep the io cause when the product root is unopenable ([daafbb9](https://github.com/nevenincs/vaultspec-dashboard/commit/daafbb95c31c791cb23edb9a32f85cacedbc20b8))
* **distribution:** sync/chmod cap-std directories O_PATH-safely on Unix ([0927527](https://github.com/nevenincs/vaultspec-dashboard/commit/092752775d783b04d25c37bf39b6563663123210))
* **engine:** clear three clippy -D warnings from cfg-asymmetric code ([b1f40af](https://github.com/nevenincs/vaultspec-dashboard/commit/b1f40af2056dae259e1ea70d4b539bfde880d840))
* **gates:** clear the two quality-gate findings on main ([71d4fdb](https://github.com/nevenincs/vaultspec-dashboard/commit/71d4fdb3afe22dbab963ce3f29f15a01b7a68893))
* **product:** bind every runtime certification case to the real artifact ([2fe0e5e](https://github.com/nevenincs/vaultspec-dashboard/commit/2fe0e5ed21bcfeadbd2ea9f3c1c0d10098430b06))
* **product:** bound control calls, ask the gateway to stop, order versions numerically ([50853d5](https://github.com/nevenincs/vaultspec-dashboard/commit/50853d514bbb2519330a8c87461afaab43fdb17c))
* **product:** give the no-follow product reads a real Windows arm ([a316cdb](https://github.com/nevenincs/vaultspec-dashboard/commit/a316cdb5976b1b336ff2c853ea7ca06857ba06f7))
* **product:** name the missing path, and refuse a spec that cannot compose ([b1a3229](https://github.com/nevenincs/vaultspec-dashboard/commit/b1a32296ce1776e182b67f95858a34b0a6c49259))
* **product:** P06 review revisions — snapshot lifecycle, win tree-kill, cleanup ([41ba93c](https://github.com/nevenincs/vaultspec-dashboard/commit/41ba93ce74b63f00f9f70b527d4d944493400881))
* **product:** point gateway shutdown at the root admin route ([619fe05](https://github.com/nevenincs/vaultspec-dashboard/commit/619fe05eb5fa3b0389e9654d42ed7fdfe682cbcd))
* **product:** release the Unix root locks by unlocking, not by closing ([ce4569f](https://github.com/nevenincs/vaultspec-dashboard/commit/ce4569f0c149bb86081fd02713ca4fbd776fd20a))
* **product:** restrict the credentials directory to 0700 in ensure() ([1189f03](https://github.com/nevenincs/vaultspec-dashboard/commit/1189f0361e8ba37e1997dd7cc7a1f9a217808037))
* **product:** split the owner-restriction by platform so Linux compiles ([e2ebc43](https://github.com/nevenincs/vaultspec-dashboard/commit/e2ebc4339b77771d6ba66346b16df9b59c8926a3))
* **product:** Windows credential retirement now completes instead of always refusing ([741ec4d](https://github.com/nevenincs/vaultspec-dashboard/commit/741ec4da8367939e32f810cbac00318852895160))
* **test:** stop one authoring failure reporting as thirteen, and fix its cause ([a426b68](https://github.com/nevenincs/vaultspec-dashboard/commit/a426b6878f2c1290ff0aac5281327a17a8674966))
* **test:** ungate imports my gateway-stop-plan proofs need on every platform ([abbece5](https://github.com/nevenincs/vaultspec-dashboard/commit/abbece5a52795162088beb923a21f11c8982867e))
* **updater:** bound the relaunch probe's discovery read + watermark it (W03.P07 Fable review) ([bae63bb](https://github.com/nevenincs/vaultspec-dashboard/commit/bae63bbb459e305b36580f1b9809787c5ce0d8e3))
* **windows-authority:** drop DELETE from the product-root open (option e) ([0489e6c](https://github.com/nevenincs/vaultspec-dashboard/commit/0489e6cd6456c2fd353730b99662b50505fe7774))
* **windows-authority:** seal private file sharing ([ec93e27](https://github.com/nevenincs/vaultspec-dashboard/commit/ec93e27cca78a6c0cdd99b529c0bfeb7a7dcb739))

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
