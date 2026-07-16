use super::*;

#[test]
fn sanitize_boundary_message_strips_serde_framing_and_position() {
    // Keeps the actionable reason (offending field + valid set), drops the
    // "into the target type" framing and the " at line N column M" position.
    assert_eq!(
        sanitize_boundary_message(
            "Failed to deserialize the JSON body into the target type: \
                 filter.doc_types: unknown field `doc_types`, expected one of \
                 `tiers`, `kinds` at line 1 column 100"
        ),
        "filter.doc_types: unknown field `doc_types`, expected one of `tiers`, `kinds`"
    );
    assert_eq!(
        sanitize_boundary_message(
            "Failed to deserialize the JSON body into the target type: \
                 missing field `key` at line 1 column 17"
        ),
        "missing field `key`"
    );
    // A non-axum message (e.g. the engine's own clean validation error or a
    // bare reason) passes through untouched.
    assert_eq!(
        sanitize_boundary_message("invalid value for `theme`: must be one of: light, dark"),
        "invalid value for `theme`: must be one of: light, dark"
    );
}

fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    std::fs::write(
            dir.path().join(".vault/plan/2026-06-12-w-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#w'\n---\n\nMentions [[2026-06-12-w-adr]] and [[2026-06-12-old-adr]].\n",
        )
        .unwrap();
    let state = build_state(dir.path().to_path_buf());
    (dir, state)
}

#[test]
fn rebuild_swap_converges_the_graph_and_emits_diffs() {
    // Audit gates W02P06-302/303: the watcher path is rebuild+swap at scope
    // granularity — a filesystem edit must converge the live graph to a cold
    // rebuild and emit the change as diff deltas on the per-scope clock
    // (W02.P04.S12).
    //
    // STRICT reference-only graph (user ruling, 2026-06-28): in-body
    // `[[wiki-link]]` mentions are no longer graphed — the only edges are
    // `related:` frontmatter references via the declared tier, which is absent
    // in this core-less fixture. So the rebuild+swap convergence + diff
    // emission is exercised at the NODE level: a new document on disk is a node
    // delta the watcher must emit and converge.
    let (dir, state) = fixture_state();
    // build_state already cold-indexed the launch cell, so the live graph
    // holds the initial node. Assert that starting state directly.
    let cell = state.active_cell();
    assert_eq!(
        cell.graph_arc().node_count(),
        1,
        "the single plan document node"
    );
    assert_eq!(
        cell.graph_arc().edge_count(),
        0,
        "in-body wiki-link mentions are not graphed (strict reference-only)"
    );

    // Edit: a new document appears on disk.
    std::fs::create_dir_all(dir.path().join(".vault/adr")).unwrap();
    std::fs::write(
        dir.path().join(".vault/adr/2026-06-12-w-adr.md"),
        "---\ntags:\n  - '#adr'\n  - '#w'\n---\n\n# w adr\n",
    )
    .unwrap();
    let emitted = cell.rebuild_and_swap().unwrap();
    assert!(emitted > 0, "the edit emits deltas");
    assert_eq!(
        cell.graph_arc().node_count(),
        2,
        "the new document node is added: the live graph converges to the cold rebuild"
    );

    // The clock is monotonic across rebuilds and the ring holds both
    // batches in order, on THIS cell's own clock.
    let ring = cell.ring.lock().unwrap();
    let seqs: Vec<u64> = ring.iter().map(|(seq, _)| *seq).collect();
    assert!(seqs.windows(2).all(|w| w[1] > w[0]));
}

#[test]
fn over_ceiling_commit_broadcasts_a_rekeyframe_marker_not_a_delta_flood() {
    // GIR-015: a commit whose diff exceeds the delta ceiling degrades to
    // keyframe-only — the deltas are DROPPED, but ONE synthetic non-"feature"
    // "rekeyframe" marker MUST ride the seq clock + resume ring so the client
    // re-keyframes. Without it the live clock would freeze (emitted=0) and
    // clients would silently miss the change until the next commit/reconnect.
    use engine_model::{CanonicalKey, Facet, Node, NodeKind, Presence, node_id};

    let (_dir, state) = fixture_state();
    let cell = state.active_cell();
    let before = cell.ring.lock().unwrap().len();

    // A fresh graph with more nodes than the delta ceiling: the document diff
    // (old 1 node → fresh N nodes) exceeds MAX_DIFF_DELTAS and DEGRADES to
    // keyframe-only. The feature diff stays IN-BOUNDS: the fixture's single
    // pre-existing `#w` feature node is removed (the fresh nodes are tagless),
    // so one legitimate feature-remove delta rides ALONGSIDE the marker. The
    // contract is one MARKER on a degraded commit, not one total payload — the
    // dropped 20k-doc-delta flood is what must never be broadcast.
    let mut fresh = LinkageGraph::new();
    let over = engine_graph::diff::MAX_DIFF_DELTAS + 1;
    for i in 0..over {
        let stem = format!("d{i:06}");
        fresh.upsert_node(Node {
            id: node_id(&CanonicalKey::Document {
                stem: stem.as_str(),
            }),
            kind: NodeKind::Document,
            key: stem.clone(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: None,
            size: None,
            facets: vec![Facet {
                scope: ScopeRef::Ref {
                    name: "main".into(),
                },
                presence: Presence::Exists,
                content_hash: Some("h".into()),
                lifecycle: None,
            }],
        });
    }

    let emitted = cell.commit_graph(fresh);
    // The over-ceiling DOCUMENT delta flood (>MAX_DIFF_DELTAS changes) is
    // DROPPED, not broadcast: the emitted set is only the small in-bounds
    // feature delta(s) plus the single marker — never the flood.
    assert!(
        emitted < engine_graph::diff::MAX_DIFF_DELTAS,
        "the over-ceiling document delta flood is dropped (emitted={emitted})"
    );

    let ring = cell.ring.lock().unwrap();
    // Exactly ONE re-keyframe marker rides the resume ring on a degraded commit
    // (the code pushes it once). Any in-bounds deltas from the non-degraded
    // feature species ride alongside it but are NOT markers.
    let marker_count = ring
        .iter()
        .skip(before)
        .filter(|(_, payload)| payload["granularity"] == "rekeyframe")
        .count();
    assert_eq!(
        marker_count, 1,
        "exactly one re-keyframe marker is broadcast on a degraded commit"
    );
    let marker = ring
        .iter()
        .skip(before)
        .map(|(_, payload)| payload)
        .find(|payload| payload["granularity"] == "rekeyframe")
        .expect("the re-keyframe marker is present in the ring");
    assert_eq!(marker["op"], "rekeyframe");
    assert!(
        marker["seq"].as_u64().is_some(),
        "the marker carries a valid contiguous seq (clock advanced by one)"
    );
    // The graph still converged to the fresh corpus (the swap is unconditional).
    assert_eq!(cell.graph_arc().node_count(), over);
}

#[test]
fn meta_edges_are_memoized_per_generation() {
    let (_dir, state) = fixture_state();
    let cell = state.active_cell();
    cell.rebuild_and_swap().unwrap();
    let a = cell.meta_edges();
    let b = cell.meta_edges();
    assert!(Arc::ptr_eq(&a, &b), "same generation: cached (W02P05-203)");
    let _ = cell.rebuild_and_swap();
    let c = cell.meta_edges();
    // New generation recomputes (pointer may differ even if equal).
    assert_eq!(*a, *c, "content equal across no-op rebuild");
}

#[test]
fn feature_nodes_are_memoized_per_generation() {
    // The constellation feature-node aggregation scans the whole corpus (group
    // members by tag, fold each member's degree-by-tier and lifecycle), so it
    // is memoized per graph generation exactly like meta_edges/document_views:
    // a same-generation query is a warm-cache hit (same Arc — no
    // re-aggregation), and a generation bump (rebuild) recomputes. This is what
    // lets the default (unfiltered) constellation poll serve from cache instead
    // of re-folding every member document on every request.
    let (_dir, state) = fixture_state();
    let cell = state.active_cell();
    cell.rebuild_and_swap().unwrap();
    let a = cell.feature_nodes();
    let b = cell.feature_nodes();
    assert!(
        Arc::ptr_eq(&a, &b),
        "same generation: feature nodes are a warm-cache hit, not re-aggregated"
    );
    let _ = cell.rebuild_and_swap();
    let c = cell.feature_nodes();
    assert_eq!(*a, *c, "content equal across a no-op rebuild");
}

#[test]
fn lineage_nodes_are_memoized_per_generation() {
    // The timeline is a server-backed projection cache, not a hot recompute:
    // the FULL range-independent lineage node set is memoized per generation,
    // so a scroll/zoom (a re-slice of the same cached set) is a warm-cache hit
    // (same Arc — no re-scan of every node, no edge iteration), and a watcher
    // rebuild (generation bump) invalidates it. This is the warm-read +
    // generation-bump-invalidation proof the timeline cache rests on.
    let (_dir, state) = fixture_state();
    let cell = state.active_cell();
    cell.rebuild_and_swap().unwrap();
    let a = cell.lineage_nodes();
    let b = cell.lineage_nodes();
    assert!(
        Arc::ptr_eq(&a, &b),
        "same generation: the lineage node set is a warm-cache hit, not re-scanned"
    );
    let _ = cell.rebuild_and_swap();
    let c = cell.lineage_nodes();
    assert!(
        !Arc::ptr_eq(&a, &c),
        "a generation bump invalidates the cache (recomputed, fresh Arc)"
    );
    assert_eq!(*a, *c, "content equal across a no-op rebuild");
}

#[test]
fn filters_vocabulary_is_memoized_per_generation() {
    // `/filters` is a full-graph scan that only changes on a rebuild, so it is
    // memoized per generation: a repeat poll is a warm-cache hit (same Arc),
    // and a generation bump recomputes.
    let (_dir, state) = fixture_state();
    let cell = state.active_cell();
    cell.rebuild_and_swap().unwrap();
    let a = cell.filters_vocabulary();
    let b = cell.filters_vocabulary();
    assert!(
        Arc::ptr_eq(&a, &b),
        "same generation: the vocabulary is a warm-cache hit, not re-scanned"
    );
    let _ = cell.rebuild_and_swap();
    let c = cell.filters_vocabulary();
    assert_eq!(*a, *c, "content equal across a no-op rebuild");
}

#[test]
fn pipeline_artifacts_are_memoized_per_generation() {
    // `/pipeline` re-projected every `doc:` node per poll; the in-flight set is
    // generation-stable, so it is memoized per generation: a repeat Work poll
    // is a warm-cache hit (same Arc), a generation bump recomputes.
    let (_dir, state) = fixture_state();
    let cell = state.active_cell();
    cell.rebuild_and_swap().unwrap();
    let a = cell.pipeline_artifacts();
    let b = cell.pipeline_artifacts();
    assert!(
        Arc::ptr_eq(&a, &b),
        "same generation: the pipeline artifacts are a warm-cache hit, not re-projected"
    );
    let _ = cell.rebuild_and_swap();
    let c = cell.pipeline_artifacts();
    assert_eq!(*a, *c, "content equal across a no-op rebuild");
}

#[test]
fn feature_coverage_is_memoized_per_generation() {
    // `/features` re-projected per-feature coverage over every `doc:` node per
    // panel read; the coverage map is generation-stable, so it is memoized per
    // generation: a repeat panel read is a warm-cache hit (same Arc), a
    // generation bump recomputes.
    let (_dir, state) = fixture_state();
    let cell = state.active_cell();
    cell.rebuild_and_swap().unwrap();
    let a = cell.feature_coverage();
    let b = cell.feature_coverage();
    assert!(
        Arc::ptr_eq(&a, &b),
        "same generation: the coverage map is a warm-cache hit, not re-projected"
    );
    let _ = cell.rebuild_and_swap();
    let c = cell.feature_coverage();
    assert_eq!(*a, *c, "content equal across a no-op rebuild");
}

fn git(dir: &std::path::Path, args: &[&str]) {
    let output = std::process::Command::new("git")
        .current_dir(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "f")
        .env("GIT_AUTHOR_EMAIL", "f@t")
        .env("GIT_COMMITTER_NAME", "f")
        .env("GIT_COMMITTER_EMAIL", "f@t")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn recent_commits_are_memoized_per_generation_not_re_walked() {
    // `/history` walked the git object DB on EVERY poll; the recent commit walk
    // is HEAD-stable (a new commit bumps the generation through a rebuild), so
    // it is memoized per generation: a repeat poll is a warm-cache hit (same
    // Arc — NO per-request disk/git walk), and a generation bump invalidates
    // it. This is the "node-only/history request does not touch disk per
    // request" proof. Uses a real git repo (no fakes/stubs).
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-18-h-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#h'\n---\n\nbody\n",
    )
    .unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "first"]);

    let state = build_state(root.to_path_buf());
    let cell = state.active_cell();
    cell.rebuild_and_swap().unwrap();

    let a = cell.recent_commits().expect("git repo is readable");
    let b = cell.recent_commits().expect("warm read");
    assert!(
        Arc::ptr_eq(&a, &b),
        "same generation: the commit walk is a warm-cache hit, not re-walked"
    );
    assert_eq!(a.len(), 1, "one commit on HEAD");

    // A generation bump (rebuild) invalidates the cache — the next read
    // recomputes a fresh Arc (content equal across a no-op rebuild: HEAD is
    // unchanged, so the same commit set).
    let _ = cell.rebuild_and_swap();
    let c = cell.recent_commits().expect("warm read after rebuild");
    assert!(
        !Arc::ptr_eq(&a, &c),
        "a generation bump invalidates the cached commit walk"
    );
    assert_eq!(*a, *c, "content equal across a no-op rebuild");
}

#[test]
fn warm_projections_primes_the_per_generation_caches() {
    // The watcher calls warm_projections off the request path after a rebuild
    // so the first user event finds the salience basis + default-view
    // projections warm, not paying the multi-second cold build. Smoke-test
    // that it runs and leaves the getters as warm-cache hits (same Arc) within
    // the generation — i.e. it wired the right projections and they cache.
    let (_dir, state) = fixture_state();
    let cell = state.active_cell();
    cell.rebuild_and_swap().unwrap();
    cell.warm_projections();
    assert!(Arc::ptr_eq(&cell.salience_basis(), &cell.salience_basis()));
    assert!(Arc::ptr_eq(&cell.meta_edges(), &cell.meta_edges()));
    assert!(Arc::ptr_eq(&cell.feature_nodes(), &cell.feature_nodes()));
}

#[test]
fn warm_projections_warms_document_views_only_after_a_drill_in() {
    // Adaptive warming: the heavy document views stay lazy for a session that
    // never drills in (no wasted multi-second derive on every rebuild), but
    // once the session HAS opened the document view, warm_projections keeps it
    // warm across rebuilds so the next Detail open is a warm-cache hit.
    let (_dir, state) = fixture_state();
    let cell = state.active_cell();
    cell.rebuild_and_swap().unwrap();

    // Never drilled in → warm leaves the document views cold (no waste).
    cell.warm_projections();
    assert!(
        cell.doc_views_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .is_none(),
        "document views must stay lazy until the session drills in",
    );

    // The session drills in once (marks intent), then the graph rebuilds.
    let _ = cell.document_views();
    cell.rebuild_and_swap().unwrap();
    let generation = cell.generation.load(Ordering::SeqCst);

    // Now warm_projections eagerly warms the document views for the NEW
    // generation, off the request path — the next Detail open is warm.
    cell.warm_projections();
    let cached = cell
        .doc_views_cache
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    assert!(
        matches!(cached, Some((g, _)) if g == generation),
        "after a drill-in, warm_projections must warm the document views for the current generation",
    );
}

#[test]
fn salience_basis_is_memoized_per_generation() {
    // graph-node-salience W05.P11.S45: the expensive lens basis (the PPR
    // partial vectors, Brandes betweenness, k-core, role features) is computed
    // ONCE per graph generation and shared by every lens. A no-op query is a
    // warm-cache hit (same Arc); a generation bump (rebuild) recomputes.
    let (_dir, state) = fixture_state();
    let cell = state.active_cell();
    cell.rebuild_and_swap().unwrap();
    let a = cell.salience_basis();
    let b = cell.salience_basis();
    assert!(
        Arc::ptr_eq(&a, &b),
        "same generation: the basis is a warm-cache hit, not recomputed"
    );
    // A generation bump (rebuild) invalidates the cache and recomputes.
    let _ = cell.rebuild_and_swap();
    let c = cell.salience_basis();
    assert_eq!(
        a.node_count(),
        c.node_count(),
        "the recomputed basis covers the same bounded node set"
    );
}

#[test]
fn embeddings_cache_invalidates_when_the_semantic_epoch_advances() {
    // rag-control-plane P03.S19: the embedding vector cache is keyed on the
    // semantic freshness epoch. An unchanged epoch serves the cached vector
    // map (no Qdrant re-scroll); an advanced epoch (a completed reindex)
    // invalidates it, forcing a re-read. This is the semantic analog of the
    // generation-keyed projection caches.
    let (_dir, state) = fixture_state();
    let cell = state.active_cell();

    // Cold cache: nothing stored at any epoch yet.
    assert!(
        cell.embeddings_if_fresh(1000).is_none(),
        "cold cache misses"
    );

    // Store the vectors scrolled at epoch 1000.
    let map_a = std::sync::Arc::new(std::collections::HashMap::from([(
        "doc:x".to_string(),
        vec![0.1f32, 0.2, 0.3],
    )]));
    cell.store_embeddings(1000, map_a.clone());

    // Same epoch ⇒ warm-cache hit (the SAME Arc, no re-scroll).
    let hit = cell.embeddings_if_fresh(1000).expect("same epoch hits");
    assert!(
        Arc::ptr_eq(&hit, &map_a),
        "an unchanged epoch serves the cached vector map"
    );

    // A reindex advances the epoch ⇒ the stale slice is invalidated.
    assert!(
        cell.embeddings_if_fresh(2000).is_none(),
        "an advanced semantic epoch invalidates the cache (re-scroll)"
    );

    // After the re-scroll stores the new map, the new epoch is the warm one
    // and the old epoch no longer hits.
    let map_b = std::sync::Arc::new(std::collections::HashMap::from([(
        "doc:y".to_string(),
        vec![0.9f32],
    )]));
    cell.store_embeddings(2000, map_b.clone());
    assert!(Arc::ptr_eq(
        &cell.embeddings_if_fresh(2000).unwrap(),
        &map_b
    ));
    assert!(
        cell.embeddings_if_fresh(1000).is_none(),
        "the superseded epoch's slice is gone"
    );
}

#[test]
fn each_scope_cell_owns_an_independent_delta_clock() {
    // W02.P03/P04: two warm cells must NOT share a delta clock — a rebuild
    // on one advances only its own seq, so per-scope `since=` resume stays
    // correct and independent.
    let (_dir, state) = fixture_state();
    let active = state.active_cell();
    active.rebuild_and_swap().unwrap();
    let active_tip = active.seq.load(Ordering::SeqCst);
    assert!(active_tip > 0, "active cell advanced its own clock");

    // A second cell over the same root but never rebuilt: its clock is
    // still zero — the active cell's commit did not touch it.
    let store = engine_store::Store::open_or_heal(&state.workspace_root.join(".vault")).unwrap();
    let other = ScopeCell::new(
        state.workspace_root.clone(),
        ScopeRef::Worktree {
            path: crate::routes::scope_token(&state.workspace_root),
        },
        store,
    );
    assert_eq!(
        other.seq.load(Ordering::SeqCst),
        0,
        "an independent cell's clock is untouched by another cell's commit"
    );
}
