---
tags:
  - '#reference'
  - '#graph-simulation-stability'
date: '2026-09-05'
modified: '2026-09-05'
body_schema: 'body-v2'
body_hash: 'sha256:922e118ad56540a42184a1b45524156b1060c794d8b4264b792987c3e114480b'
related:
  - "[[2026-09-05-graph-simulation-stability-plan]]"
  - "[[2026-09-05-graph-simulation-stability-performance-reference]]"
---

# `graph-simulation-stability` reference: `Production before and after performance measurements`

## Summary

Matched production-build measurements use the corrected-force baseline `4ece5c1a` and the current implementation. The earlier audit used a development build and a different viewport; its timings are historical grounding, not the denominator for this comparison.

## Reproduction

Run `node dev/tooling/graph-performance.ts --baseline 4ece5c1a --counts 1200,5000 --phase all` from `frontend`. The maintained runner builds both revisions, serves only benchmark artifacts on the canonical loopback performance port, launches Chrome through Playwright, and closes browser/server in cleanup. It uses the same installed dependencies and dev harness for both bundles; a build-time source loader reads baseline production files directly from Git. No copied legacy physics implementation is maintained. `--phase kernels` and `--phase host` split workloads; `--build-only` only prepares the bundles.

Generated bundles and bounded JSON reports live in `.tmp/graph-performance`. Results include the baseline commit, current HEAD and dirty source list, bundle hashes, browser, rendering device, CPU, viewport and device scale. This shared workstation is not a dedicated performance lab. Runs are serial and exclude this task's competing tests or lint processes. Browser contexts must report a valid renderer before measurement and no context loss at completion.

The runner reserves its strict port before compilation, builds in a disposable child process and warms a valid GPU context before either revision. Windows Chrome uses the recorded D3D11 ANGLE argument. Manifest and installed dependency fingerprints are checked before and after building and measurement; a change invalidates the run. This guards against dependency installation elsewhere in the shared workspace.

The server snapshots both revisions' JavaScript, stylesheet and source map immediately after compilation. All measured pages load these immutable buffers, and report hashes identify those exact bytes. A final disk fingerprint check rejects external artifact changes, including a concurrent standalone build.

The direct production scene is mounted without a React diagnostic root. Viewport is 1440 by 900, DPR 1. Deterministic fixtures contain feature hubs and document nodes, membership edges and cross-links: 1200 nodes / 2348 edges and 5000 nodes / 9894 edges. Production appearance and physics defaults are retained.

## Measurement boundaries

- Kernel probes use identical fixed coordinates, radii and degree masses: cold and dense phyllotaxis, plus an elongated line. Five warmup rounds precede twenty measured rounds per force. Baseline/candidate order alternates on every round across two isolated pages; charge/collision order also alternates. Kernels never run concurrently. Resetting input velocities is outside timing. This isolates arithmetic/tree/grid cost, not whole-scene responsiveness.
- Unchanged-data probes freeze the scene, then send cloned but compatible nodes and edges twelve times, excluding the first two durations. Cloning is outside timing. The measured command includes compatibility checks, theme reads, attribute maintenance and normal command side effects. Solver/texture replacement counts and computed-style reads accompany timing.
- Cold scene ingestion includes synchronous prewarm. Live windows run the real callback and solver for approximately three seconds. Solver ticks, callback CPU, render-submission CPU, frame intervals and physical step counts are captured separately; these are short diagnostic windows, not service-level percentiles or GPU execution measurements.
- Local drag begins only after natural solver termination. After the cold live sample, remaining solver work runs in bounded chunks, with a 1600-tick and 180-second safety limit. Remaining settle CPU and tick counts are not total cold-load wall-clock settling. The final node is held and moved 80 world units; five warmup ticks precede thirty measured drag ticks, followed by a second live window. Free-awake and held counts qualify the workload.
- Drag component timers wrap the real link, charge and collision forces without substituting implementations or changing force order. Original forces are restored before the live window. Timer overhead is included in the direct drag-tick samples for both revisions, but not the subsequent live ticks.
- Up to eight real browser clicks are sampled during each live window; actual sample counts and elapsed window duration are reported. Pointer queue delay and thresholded Event Timing entries are observations, not page-wide INP certification. Small sample counts and shared-machine scheduling limit interpretation.
- Idle checks explicitly pin rest, clear animation dirtiness, schedule one real clean callback and observe callbacks/render calls for one second. They establish production idle suppression and absence of self-scheduled continuation, not natural post-drag convergence or heap-leak freedom.

## Results

Primary matched run: 2026-09-05 23:17 UTC, corrected-force baseline `4ece5c1a8464c0dafc89d82a0a4a092cef13e6e3`, candidate worktree at HEAD `02b4bfe4c4a0a858841b5cf1dfdb0ea0d3d2ac29`. AMD Ryzen 9 5900X, RTX 4080 SUPER through ANGLE D3D11, Chrome 145, Node 24.12.0. The local retained report is `.tmp/graph-performance/run1-results.json`; exact dependency and all six asset fingerprints are included there. JavaScript SHA-256 fingerprints: baseline `3cf02da4a13cc18a9dedad009bbb13e9533e1606c339027195497081b5557056`; candidate `f1ed15e510f7e103999b5328ee661a769f08ead6a82289106ac211f2d931eb56`.

| Measurement, milliseconds unless noted | 1200 baseline | 1200 optimized | 5000 baseline | 5000 optimized |
| --- | ---: | ---: | ---: | ---: |
| Local drag tick, mean of 30 | 15.95 | 1.90 | 113.39 | 3.75 |
| Local drag callback, median | 47.90 | 2.10 | 345.60 | 5.00 |
| Local drag callback, observed p95 | 51.10 | 3.60 | 370.60 | 6.40 |
| Local drag frame interval, observed p95 | 66.70 | 16.70 | 383.30 | 16.80 |
| Compatible data command, mean of 10 | 11.01 | 1.35 | 38.92 | 4.27 |
| Computed-style reads per command | 1202 | 1 | 5002 | 1 |
| Solver/texture replacements across 12 commands | 12 | 0 | 12 | 0 |
| Cold-live solver tick, mean | 15.86 | 15.64 | 108.70 | 103.97 |
| Cold-live callback, median | 47.90 | 16.10 | 326.60 | 105.30 |
| Cold data ingestion including synchronous prewarm | 280.00 | 286.00 | 380.70 | 416.10 |

The 5000-node drag improvement is 30.2 times for direct tick CPU and 9.1 times for compatible data updates. Both 5000-node drag probes held one node with one free-awake node; both 1200-node probes held one with two free-awake nodes. The final 5000-node drag components averaged 0.37 ms link, 1.52 ms charge and 1.67 ms collision. Full drag callbacks include the remaining host/render work.

Paired 5000-node kernel means, baseline to optimized: cold charge 73.20 to 68.05 ms; dense charge 39.71 to 38.73 ms; dense collision 49.93 to 46.46 ms. Cold collision was 11.91 to 12.33 ms and line collision 8.04 to 8.22 ms: this increment is not a uniform all-kernel speedup. The large benefit is avoiding discarded work on pinned regions, with a smaller ordinary repulsion improvement.

Eight local-drag pointer samples per revision observed mean queue delay of 195.28 to 3.40 ms at 5000 nodes. These sparse samples are supportive diagnostics, not an INP or input-latency guarantee. All four explicit pinned-rest idle probes executed one clean callback, zero renders and no scheduled continuation; no page errors or context loss occurred.

Repeat run: 2026-09-05 23:20 UTC, `--counts 5000,1200 --phase host`, reversing host revision order at both sizes. The retained `.tmp/graph-performance/run2-results.json` has identical fingerprints for all six served assets and the same dependency snapshot. At 5000 nodes, direct drag mean was 107.34 to 3.67 ms (29.2 times), compatible updates 30.27 to 4.44 ms (6.8 times), and median drag callbacks 313.50 to 4.70 ms. Optimized drag frame spacing remained 16.7 ms at the observed p95. At 1200 nodes, drag was 15.90 to 1.80 ms and updates 11.36 to 1.32 ms. Idle checks again produced one clean callback, zero renders and no continuation, with no page errors or context loss. Differences between absolute run timings reinforce the shared-workstation limitation; the local-drag and reuse improvements replicated despite reversed order.

## Remaining limits

Large fully active layouts still cost about 104 ms per tick on this device. The live budget prevents three-tick amplification, not an indivisible long tick. Cold synchronous ingestion did not improve, and its nominal prewarm budget can still overshoot between ticks. In the optimized drag live windows, the clock recorded 180 executed / zero discarded ticks at 1200 nodes and 154 executed / 26 discarded at 5000; smooth callback spacing is not proof of uninterrupted 60 Hz physics throughput. Discarded time never advances alpha or anneal state.

The remaining post-live settling probes reached natural termination in both revisions, but their tick counts and CPU durations start after different amounts of live work. They must not be presented as total wall-clock settle-time speedups. The maintained harness covers these deterministic hub/document fixtures, not every real graph, maximum-capacity coincident geometry, low-end device, long-session memory behavior or dedicated delta-reflow/retune timing. An off-thread implementation or a new approximation remains separate architectural work.
