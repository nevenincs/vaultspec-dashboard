# Changelog

## [0.1.5](https://github.com/nevenincs/vaultspec-dashboard/compare/v0.1.4...v0.1.5) (2026-07-22)


### Features

* **a2a:** add gated distribution and lifecycle authority ([9deba3c](https://github.com/nevenincs/vaultspec-dashboard/commit/9deba3c00b4a652f997b44312b390da31a349a87))
* **a2a:** attach-control terminal-settlement route (W02.P05 S41/S152/S153/S154) ([1de7af9](https://github.com/nevenincs/vaultspec-dashboard/commit/1de7af945e01a279b4627e924ab5b8966b70b680))
* **a2a:** bound terminal-lease retention + redact discovery token in Debug ([6cb2d28](https://github.com/nevenincs/vaultspec-dashboard/commit/6cb2d28726c29c8517a93f07f65c6d8d5ec104d4))
* **a2a:** broker active run discovery ([6df0cd5](https://github.com/nevenincs/vaultspec-dashboard/commit/6df0cd59ade8358ce6f1943f3aba579f7db9cfbc))
* **a2a:** dedicated durable run-token lease repository (W02.P05 S35/S150/S151) ([a97580d](https://github.com/nevenincs/vaultspec-dashboard/commit/a97580d591052bfdb891d9bff17fa220da5b6789))
* **a2a:** dual-resolve the /ops/a2a run edge (W02.P04 S30/S31) ([59d140d](https://github.com/nevenincs/vaultspec-dashboard/commit/59d140d2ed967dde03420fd7478e47340e50e790))
* **a2a:** durable lease reconciliation at seated boot (S161) ([17c4b43](https://github.com/nevenincs/vaultspec-dashboard/commit/17c4b432fe15bbe3b7e87093ce7e8bca5e1d9e95))
* **a2a:** resolve run-token principals against the lease repo (W02.P05 S37/S38) ([5837cc8](https://github.com/nevenincs/vaultspec-dashboard/commit/5837cc88edabb5b80ea6b232076a479e0b0f6538))
* **a2a:** wire the seated lifecycle — reconcile, honest agent tier, CLI ([c9745f2](https://github.com/nevenincs/vaultspec-dashboard/commit/c9745f2526a15f918eadfa6a36a623c7a8d419e4))
* **agent:** a2a team-run live transcript + reload-recovery, Fable-reviewed ([b6816ab](https://github.com/nevenincs/vaultspec-dashboard/commit/b6816abec5fff6ded6c34a39d0403f8f8fba86d4))
* **api:** serve a race-free A2A lifecycle job plane (W01.P03) ([68e8d84](https://github.com/nevenincs/vaultspec-dashboard/commit/68e8d8412647005b722a0b347483b10c036ab8a1))
* **authoring:** add benign close_session verb reaching SessionStatus::Closed ([a91f38c](https://github.com/nevenincs/vaultspec-dashboard/commit/a91f38cab2d614a37d648978c012b2d50b2dbc0a))
* **authoring:** bounded interrupt list page + typed decision projection; changeset run/turn provenance (wire-gaps P02/P03 core, S15/S16/S22) ([169ecd4](https://github.com/nevenincs/vaultspec-dashboard/commit/169ecd4aa0edb1cc456e56b85b7472fc1a3bcf50))
* **authoring:** durable after-fact acknowledgement HTTP route + wiring (W10) ([90c2bd5](https://github.com/nevenincs/vaultspec-dashboard/commit/90c2bd53cd4450962c686615aab2a045f7dca22a))
* **authoring:** immutable digest-addressed feedback batches — create/read routes + turn-contract consumption fence (edge P04 S09/S10, wire-gaps D7) ([d5bfbac](https://github.com/nevenincs/vaultspec-dashboard/commit/d5bfbac93220e661214065231f652ba0060b23dc))
* **authoring:** inline model-owned create-proposal content in the served catalog schema ([aad8ba6](https://github.com/nevenincs/vaultspec-dashboard/commit/aad8ba60b10cf1072ecbb188251756088bec6bad))
* **authoring:** mount interrupt-list + mode read routes, flow run/turn provenance through execute dispatch (wire-gaps S17/S23/S25) ([4063e2b](https://github.com/nevenincs/vaultspec-dashboard/commit/4063e2b150563929c883e31e1e7cb383ca8c9183))
* **authoring:** narrow InterruptResumeRequest to typed decisions with a steer arm — write/read one language, decision_unreadable legacy escape (wire-gaps S18) ([4a666df](https://github.com/nevenincs/vaultspec-dashboard/commit/4a666df724232f5c9559af6683c0277d9c53b246))
* **authoring:** request_changes third verdict — served eligibility + review-station UI ([5a62009](https://github.com/nevenincs/vaultspec-dashboard/commit/5a620099b665b413cd4890ea5709d46c8872021b))
* **authoring:** serve session/run/turn provenance on ProposalProjection from the origin revision (wire-gaps S24, D4) ([145d699](https://github.com/nevenincs/vaultspec-dashboard/commit/145d699f96b8b7ddab21753b4bb78e29a6551bae))
* **cli:** vaultspec verify-release — the shipped installer placement-integrity verb (W04.P09) ([31b6e9d](https://github.com/nevenincs/vaultspec-dashboard/commit/31b6e9d7aafe97976348366509af9e387687218a))
* **distribution:** harden capability-held datastore directories relatively ([95070f5](https://github.com/nevenincs/vaultspec-dashboard/commit/95070f556000284f39579900caecbb1cb0854463))
* **distribution:** harden persisted datastore files on their own creation handles ([ad20634](https://github.com/nevenincs/vaultspec-dashboard/commit/ad2063464937a76f379cf6d59c8ad73f2e3680c2))
* **distribution:** MaterializationSource — the sealed sync seam from verified release to materializer ([4ae471e](https://github.com/nevenincs/vaultspec-dashboard/commit/4ae471e3ce4a01c6e8146511eb701a44fd917067))
* **distribution:** owner-private publication staging on Windows (S11 Stage 5, publication half) ([940dc7d](https://github.com/nevenincs/vaultspec-dashboard/commit/940dc7d0f36107d1eeb4cd535f66dd43383cf387))
* **distribution:** retire the Windows platform gate; pin the flush access-rights boundary ([d8c5f6f](https://github.com/nevenincs/vaultspec-dashboard/commit/d8c5f6f01f1710fed5acae3694f02407340d1db6))
* **distribution:** unsealed-verify test seam + production-graph purity check (S11 Stage 1) ([a996c19](https://github.com/nevenincs/vaultspec-dashboard/commit/a996c1970bca01f12d6cad386a720d5d5fafd953))
* **engine:** /ops/a2a five-verb pass-through + per-run stream relay (a2a-edge P02+P03, S03-S05/S07-S08) ([fd7069c](https://github.com/nevenincs/vaultspec-dashboard/commit/fd7069cb014d95b893fdfb482dafcdcd7ce446fd))
* **engine:** agent-wire-gaps P01 — run outcome enum, run-scoped cancel, session cancel, queued-turn primitive ([1653b4b](https://github.com/nevenincs/vaultspec-dashboard/commit/1653b4b85d725acbfd556c2c5f79b1716d87d321))
* **engine:** P04a — the ONE bounded background janitor (abandoned-run reap + undriven expiry seams) ([122079b](https://github.com/nevenincs/vaultspec-dashboard/commit/122079b3d6fbcc7831665a3a8bb232d7f25ac5be))
* **product:** add gated A2A contract checker ([5fb342d](https://github.com/nevenincs/vaultspec-dashboard/commit/5fb342d42cbef8bb0bc79b984298c47c0ae4c1be))
* **product:** assert_cold_stopped — the proceed-cold quiescence mint, plus the no-force-kill policy record ([43984a0](https://github.com/nevenincs/vaultspec-dashboard/commit/43984a0394a9929f4af260d3566c73e690bf314e))
* **product:** bind installation transaction authority ([e04e689](https://github.com/nevenincs/vaultspec-dashboard/commit/e04e6898e966946969b8c5a2505d84ae8ba3fa5f))
* **product:** bind release verification to generation ([3861d1d](https://github.com/nevenincs/vaultspec-dashboard/commit/3861d1d56693925b96dc4b403b8cd7bee95ae97b))
* **product:** close S163 generation authority proofs ([ed02513](https://github.com/nevenincs/vaultspec-dashboard/commit/ed0251394b4a46bb8722f6ea261ac7b55018cf60))
* **product:** control only the owned gateway — protocol, discovery, control, process, lifecycle ([ec6b3cb](https://github.com/nevenincs/vaultspec-dashboard/commit/ec6b3cbfdf7ec8d8b0b36ecfe9625a337dc520f4))
* **product:** derive the first-install bootstrap fact from proof, not a bool (S11 Stage 2) ([b8d0ae4](https://github.com/nevenincs/vaultspec-dashboard/commit/b8d0ae4886369b5f74cf24123ab489de67911e02))
* **product:** deterministic interruption recovery (W03.P06.S53) ([1f98d49](https://github.com/nevenincs/vaultspec-dashboard/commit/1f98d49e61a9979328abbd2090ed75c70783d2f5))
* **product:** drain-by-discovery — the copied updater stops a gateway it never spawned ([73541f0](https://github.com/nevenincs/vaultspec-dashboard/commit/73541f0f6d17f4d7421afc2ff68175f2bb6b9d8e))
* **product:** enforce the file_digests completeness law at build time (W04.P08.S64/S65) ([f52f7c5](https://github.com/nevenincs/vaultspec-dashboard/commit/f52f7c5f239fce3b1cc024063c59131b86cb8ce1))
* **product:** establish fixed receipt authority ([a1e69c2](https://github.com/nevenincs/vaultspec-dashboard/commit/a1e69c23e4e4adc05dd9099e00bdfa0d975dc52d))
* **product:** land S171/S172 tear-safe receipt publication (Windows journal install + tear-safe activation) ([c6d15b7](https://github.com/nevenincs/vaultspec-dashboard/commit/c6d15b778ba41aa47aa7f516c63181f03f96f675))
* **product:** mark_accepted — the clean Accepted terminal for the updater ([0628645](https://github.com/nevenincs/vaultspec-dashboard/commit/0628645080d3563125eb59f588f138fdf1179245))
* **product:** migration-range validation + bounded staged migration (W03.P06.S50) ([f8e96a2](https://github.com/nevenincs/vaultspec-dashboard/commit/f8e96a235ad539a7daa06073192eb60868c245cb))
* **product:** ordered durable update transaction (W03.P06.S52) ([d6afc4b](https://github.com/nevenincs/vaultspec-dashboard/commit/d6afc4bea0156e5a0a6970a7533889a2417864d8))
* **product:** register product contract crate ([90b3017](https://github.com/nevenincs/vaultspec-dashboard/commit/90b3017c2cf4fe903a1707f801f97006cb8e467a))
* **product:** retain locked generation authority ([f11632e](https://github.com/nevenincs/vaultspec-dashboard/commit/f11632ebd7b6141003a24d4f61ee74d4ee28e12b))
* **product:** Scoop/WinGet/MSI channel authority adapters (W03.P06.S156-S158) ([a66a10e](https://github.com/nevenincs/vaultspec-dashboard/commit/a66a10ed178c1ecdc187be498b5d55bb90442a86))
* **product:** self-install channel authority adapter (W03.P06.S51) ([2b930c9](https://github.com/nevenincs/vaultspec-dashboard/commit/2b930c906b0f56841183eb37fe62ef218222993b))
* **product:** swap the P07 handoff write to the real owner-restricted DACL (S60) ([095ba29](https://github.com/nevenincs/vaultspec-dashboard/commit/095ba29da023c604acab1bb8ff07481af7b5fa77))
* **product:** the archive→generation materializer — verified bytes become the receipt-selected release ([dd37164](https://github.com/nevenincs/vaultspec-dashboard/commit/dd37164d505a57311a33bb4ed02e7457ca854cad))
* **product:** the cohort-digest CLI bin (W04.P08.S166) ([c69880b](https://github.com/nevenincs/vaultspec-dashboard/commit/c69880b1f5375f73d4d5856da4c7b07090c2f1a6))
* **product:** the composed-tree scanner — real file_digests evidence (W04.P08.S64 b) ([ce215f1](https://github.com/nevenincs/vaultspec-dashboard/commit/ce215f1ebb4c92abf176374eb5fe21b4106c3bef))
* **product:** the product-build CLI over compose_product_tree (W04.P08.S64) ([6139304](https://github.com/nevenincs/vaultspec-dashboard/commit/61393046d9ff15db7d9d5f63756779c281eb8762))
* **product:** the product-tree composer — place, scan, assemble, emit, cover (W04.P08.S64) ([3176cbb](https://github.com/nevenincs/vaultspec-dashboard/commit/3176cbbb4db7d5e16ef6b3de52d4c29d0f551e0e))
* **product:** the release-set member-manifest emitter (W04.P08.S64/S65) ([17bc0c3](https://github.com/nevenincs/vaultspec-dashboard/commit/17bc0c32267880604f36d8202f9840e342ba44b4))
* **product:** the S166 cohort-digest emitter (W04.P08.S166) ([1d6e57f](https://github.com/nevenincs/vaultspec-dashboard/commit/1d6e57ffed0de1ccd916c1733ad54d9475891a6a))
* **product:** the sealed first-install ProvisioningTransaction (S11 Stage 3) ([589e401](https://github.com/nevenincs/vaultspec-dashboard/commit/589e401ef572e29244f5e19956a49a5e0b5996b7))
* **product:** the vaultspec-product authority substrate — manifest, paths, receipt, credentials, locking ([217e66f](https://github.com/nevenincs/vaultspec-dashboard/commit/217e66f94dc14bb736adb8ff9fafe5222c3e2ac0))
* **product:** un-gate Windows credential bootstrap on the D9 private-file authority (D6) ([44e96af](https://github.com/nevenincs/vaultspec-dashboard/commit/44e96af13dd14afdbed352637ed5a47c77eda534))
* **product:** verified consistency-group snapshot (W03.P06.S49) ([65c9386](https://github.com/nevenincs/vaultspec-dashboard/commit/65c93863c8bf61cff7ed19203f698d856b6949ef))
* **product:** verify complete release-set authority ([f57cb10](https://github.com/nevenincs/vaultspec-dashboard/commit/f57cb10a982c5b7e9e2c2d6ca09505235ab3259b))
* **product:** verify the capsule carries a standalone MCP entrypoint (W04.P08.S87) ([8500fc6](https://github.com/nevenincs/vaultspec-dashboard/commit/8500fc63553c99ff7b9b1d68cd4d4eff2aaa3a55))
* **product:** verify_installed_tree — the installer's placement-integrity check (W04.P09) ([49353b1](https://github.com/nevenincs/vaultspec-dashboard/commit/49353b17f8c296eb4da51fb68aef155997fe05fb))
* **product:** wire the owned-gateway reconcile spawn env (credentials dir + settlement URL) ([09b4bd9](https://github.com/nevenincs/vaultspec-dashboard/commit/09b4bd9a864ed1091431adda2326c1b26a7ca934))
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
* **windows-authority,distribution:** implement Windows directory-metadata durability (W01.P01.S177) ([ca509f1](https://github.com/nevenincs/vaultspec-dashboard/commit/ca509f1e638efd26da27a3c2028bd953d4c4d1f1))
* **windows-authority:** parent-relative hardening and observation constructors ([e0f10bf](https://github.com/nevenincs/vaultspec-dashboard/commit/e0f10bf0e6961b9a79c1febca2b253e87bd88680))
* **windows-authority:** parent-relative private-FILE constructors ([d86d4d1](https://github.com/nevenincs/vaultspec-dashboard/commit/d86d4d123599be3a2b0c8e6ff6436d935feb0352))
* **windows-authority:** purpose-split private-file rights + SE_DACL_PROTECTED observation (D9) ([5dc522d](https://github.com/nevenincs/vaultspec-dashboard/commit/5dc522dba562239b02acd9c8d58dd928cf248865))
* **windows-authority:** read-only directory observation authority + consumer cutover ([ad9c05b](https://github.com/nevenincs/vaultspec-dashboard/commit/ad9c05b034617c78a7321044dd94fceb7b19811c))
* **windows-authority:** the materializer child-file primitives — fenced create-new + handle-relative no-replace install ([390670d](https://github.com/nevenincs/vaultspec-dashboard/commit/390670d9b5a3b03ed38a3c09a0d7cdbb74c0058d))
* **windows:** retain directory authority ([2331f89](https://github.com/nevenincs/vaultspec-dashboard/commit/2331f89237ee4c9b5807b28408740a209020d8f7))


### Bug Fixes

* **a2a:** clippy type-alias + S34 foreign-handoff test to the hardened contract ([e3d1b45](https://github.com/nevenincs/vaultspec-dashboard/commit/e3d1b450d764b9c238bb8fc327b92e33a9bf35da))
* **a2a:** close active-run recovery audit ([08ceeb8](https://github.com/nevenincs/vaultspec-dashboard/commit/08ceeb8214247ccc961d095be08a4df6d0f3df20))
* **a2a:** fence reload recovery scope ([0a7f6f6](https://github.com/nevenincs/vaultspec-dashboard/commit/0a7f6f6357313e3558b0505aa660053f6b5859c0))
* **a2a:** key run-start actor-token bundle by canonical vaultspec agent_ids ([412519a](https://github.com/nevenincs/vaultspec-dashboard/commit/412519a59d5b55d2820c1cbaa54456e693c5510d))
* **api:** one bounded child runner that always drains stderr ([804c619](https://github.com/nevenincs/vaultspec-dashboard/commit/804c619441908fa215ec7381079b310c1da2eb68))
* **authoring:** resume_interrupt gains the run-owner-or-delegator floor (P05 review HIGH) — stranger fence tested engine+frontend, steer test models product ownership ([ff3863d](https://github.com/nevenincs/vaultspec-dashboard/commit/ff3863dbec5ec24944eb6f75366a32ada5b7abf5))
* **distribution-authority:** keep the io cause when the product root is unopenable ([daafbb9](https://github.com/nevenincs/vaultspec-dashboard/commit/daafbb95c31c791cb23edb9a32f85cacedbc20b8))
* **engine:** annotate relay seq into frame data — SSE id line is invisible to the fetch-stream parser, breaking reconnect dedup (W05.P05 follow-up) ([212c322](https://github.com/nevenincs/vaultspec-dashboard/commit/212c322bbb75301fa1509a3ef0db78aa97b3969a))
* **engine:** clippy needless-borrow in group3 uri builders ([e37806b](https://github.com/nevenincs/vaultspec-dashboard/commit/e37806b1f9a95701e3873f19e9a4a4e35766b10d))
* **engine:** de-lazy the a2a sibling envelope fallback (clippy) ([a8a68f6](https://github.com/nevenincs/vaultspec-dashboard/commit/a8a68f6a8fd54deca22422fcf7eeef5e0e1a2805))
* **engine:** janitor review revisions — budget_exhausted honesty for all five duties, real backstop compaction proof ([3b0ebd2](https://github.com/nevenincs/vaultspec-dashboard/commit/3b0ebd217a8fa308403d65228b63c94588f4e8f4))
* **product:** close Unix receipt authority portability gaps ([e64290b](https://github.com/nevenincs/vaultspec-dashboard/commit/e64290b1beae64cd3f1838aba59041cb02b910ed))
* **product:** credential secrets from getrandom OS CSPRNG, not std RandomState (review HIGH) ([931d2f2](https://github.com/nevenincs/vaultspec-dashboard/commit/931d2f287d60498096bcc419af85f7139f194819))
* **product:** give the no-follow product reads a real Windows arm ([a316cdb](https://github.com/nevenincs/vaultspec-dashboard/commit/a316cdb5976b1b336ff2c853ea7ca06857ba06f7))
* **product:** mutation gate permits the installed-but-stopped cold state (P03 review HIGH) ([f614247](https://github.com/nevenincs/vaultspec-dashboard/commit/f614247efe25e4f17f98df124da3ec6f647ae55d))
* **product:** P02 review — narrow gateway constructor, redact spec Debug, compose the owned+ownership mutation gate ([62ab63d](https://github.com/nevenincs/vaultspec-dashboard/commit/62ab63d4549ac5c8a06705fe0173a05338d48c83))
* **product:** P02 review — redact ControlClient secret; proof-of-death temp sweep ([b9f2683](https://github.com/nevenincs/vaultspec-dashboard/commit/b9f268323cae2c7ace55de1108e4e79b517c4e42))
* **product:** P06 review revisions — snapshot lifecycle, win tree-kill, cleanup ([41ba93c](https://github.com/nevenincs/vaultspec-dashboard/commit/41ba93ce74b63f00f9f70b527d4d944493400881))
* **product:** restrict the credentials directory to 0700 in ensure() ([1189f03](https://github.com/nevenincs/vaultspec-dashboard/commit/1189f0361e8ba37e1997dd7cc7a1f9a217808037))
* **product:** Windows credential retirement now completes instead of always refusing ([741ec4d](https://github.com/nevenincs/vaultspec-dashboard/commit/741ec4da8367939e32f810cbac00318852895160))
* **product:** write attach.cred to match the a2a gateway read contract ([397181f](https://github.com/nevenincs/vaultspec-dashboard/commit/397181f9d75df51efbbee9a0b756ea0bd9726fef))
* **updater:** bound the relaunch probe's discovery read + watermark it (W03.P07 Fable review) ([bae63bb](https://github.com/nevenincs/vaultspec-dashboard/commit/bae63bbb459e305b36580f1b9809787c5ce0d8e3))
* **windows-authority:** drop DELETE from the product-root open (option e) ([0489e6c](https://github.com/nevenincs/vaultspec-dashboard/commit/0489e6cd6456c2fd353730b99662b50505fe7774))
* **windows-authority:** seal private file sharing ([ec93e27](https://github.com/nevenincs/vaultspec-dashboard/commit/ec93e27cca78a6c0cdd99b529c0bfeb7a7dcb739))


### Performance

* **a2a:** memoize the per-response agent-tier resolution (review MEDIUM) ([bc6461c](https://github.com/nevenincs/vaultspec-dashboard/commit/bc6461c9a6292fab5cc0ace31196c6676f6d451b))

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
