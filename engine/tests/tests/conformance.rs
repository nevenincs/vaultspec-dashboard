//! Consumer-shaped conformance test (addendum plan S06, audit ADD-901):
//! asserts the TYPED-CLIENT expectations per contract capability over live
//! serve responses — the GUI's reading, not the engine's own. Written
//! failing-first: each S49 divergence is reproduced as an assertion that
//! was red before the S01–S05 fixes landed.

use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::Duration;

fn binary() -> PathBuf {
    let target = Path::new(env!("CARGO_MANIFEST_DIR")).join("../target/debug");
    let exe = if cfg!(windows) {
        "vaultspec.exe"
    } else {
        "vaultspec"
    };
    target.join(exe)
}

fn git(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
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

/// Two-commit fixture: a vault corpus with features, titles, dates, and a
/// code mention — enough surface for every contract capability.
fn fixture() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    git(&root, &["init", "-b", "main", "."]);
    git(&root, &["config", "core.autocrlf", "false"]);
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::create_dir_all(root.join(".vault/audit")).unwrap();
    std::fs::create_dir_all(root.join(".vault/exec")).unwrap();
    std::fs::create_dir_all(root.join(".vault/rule")).unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/lib.rs"), "pub fn alpha() {}\n").unwrap();
    // The ADR carries the H1 status line (`accepted`) so the per-type status
    // projection (node-visual-richness ADR P01) has a real decision token to
    // read — `accepted` -> status_class `affirmed`.
    std::fs::write(
        root.join(".vault/adr/2026-06-13-conf-adr.md"),
        "---\ntags:\n  - '#adr'\n  - '#conf-feature'\ndate: '2026-06-13'\n---\n\n\
         # conf adr title (**status:** `accepted`)\n\nDecides things.\n",
    )
    .unwrap();
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "T1: adr"]);
    // The plan carries a frontmatter `tier` so its per-type status reads as the
    // `tiered` class with the ordinal `L2` in the value (the checkbox progress
    // stays the SEPARATE generic progress channel).
    std::fs::write(
        root.join(".vault/plan/2026-06-13-conf-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#conf-feature'\ndate: '2026-06-13'\ntier: L2\n---\n\n\
         # conf plan title\n\n- [x] `S01` - touch `src/lib.rs`; see [[2026-06-13-conf-adr]]\n\
         - [ ] `S02` - later\n",
    )
    .unwrap();
    // An audit whose worst finding severity is `high` -> status_class `graded`.
    std::fs::write(
        root.join(".vault/audit/2026-06-13-conf-audit.md"),
        "---\ntags:\n  - '#audit'\n  - '#conf-feature'\ndate: '2026-06-13'\n---\n\n\
         # conf audit\n\n## Finding FA1 (high)\n\nReviews [[2026-06-13-conf-plan]].\n",
    )
    .unwrap();
    // A second ADR with the `proposed` token -> status_class `provisional`,
    // covering the provisional decision state.
    std::fs::write(
        root.join(".vault/adr/2026-06-13-conf-adr-two.md"),
        "---\ntags:\n  - '#adr'\n  - '#conf-feature'\ndate: '2026-06-13'\n---\n\n\
         # conf adr two (**status:** `proposed`)\n\nA provisional decision.\n",
    )
    .unwrap();
    // A vault rule whose `## Status` names a successor (`superseded by`) ->
    // `superseded` -> status_class `retired`.
    std::fs::write(
        root.join(".vault/rule/2026-06-13-conf-rule.md"),
        "---\ntags:\n  - '#reference'\n  - '#conf-feature'\ndate: '2026-06-13'\n---\n\n\
         # conf rule\n\n## Status\n\nSuperseded by the conf-rule-two successor.\n",
    )
    .unwrap();
    // An exec record: a type with no per-type status machine -> BOTH status
    // fields absent (the honest-absence case).
    std::fs::write(
        root.join(".vault/exec/2026-06-13-conf-S01.md"),
        "---\ntags:\n  - '#exec'\n  - '#conf-feature'\ndate: '2026-06-13'\n---\n\n\
         # conf exec record\n\nExecuted [[2026-06-13-conf-plan]].\n",
    )
    .unwrap();
    std::fs::write(
        root.join(".vault/adr/2026-06-13-other-adr.md"),
        "---\ntags:\n  - '#adr'\n  - '#other-feature'\ndate: '2026-06-13'\n---\n\n\
         # other adr\n\nMentions [[2026-06-13-conf-plan]].\n",
    )
    .unwrap();
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "T2: plan + cross-feature adr"]);
    (dir, root)
}

struct ServeGuard(Child);
impl Drop for ServeGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
    }
}

/// Start serve on an OS-assigned EPHEMERAL port (`--port 0`) and read the
/// real bound port + token back from the fixture's own `service.json` — so
/// concurrent test runs never collide on a fixed port (recorded backlog,
/// 2026-06-13). Each fixture has an isolated service.json, so the port read
/// is unambiguous.
fn start_serve(root: &Path) -> (ServeGuard, u16, String) {
    let child = Command::new(binary())
        .current_dir(root)
        .args(["serve", "--port", "0"])
        .spawn()
        .expect("serve starts");
    // Guard the child IMMEDIATELY so it is killed on every path, including the
    // deadline-assert panic below (clippy::zombie_processes).
    let guard = ServeGuard(child);
    let service_json = root.join(".vault/data/engine-data/service.json");
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    loop {
        if let Ok(raw) = std::fs::read_to_string(&service_json)
            && let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw)
            && let Some(port) = v["port"].as_u64()
            && port != 0
            && let Some(token) = v["service_token"].as_str()
        {
            break (guard, port as u16, token.to_string());
        }
        assert!(std::time::Instant::now() < deadline, "serve never came up");
        std::thread::sleep(Duration::from_millis(200));
    }
}

fn http(
    port: u16,
    method: &str,
    path: &str,
    token: &str,
    body: Option<&str>,
) -> (u16, serde_json::Value) {
    use std::io::{Read, Write};
    let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect");
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .unwrap();
    let body = body.unwrap_or("");
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
         Authorization: Bearer {token}\r\nContent-Type: application/json\r\n\
         Content-Length: {}\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).unwrap();
    let mut raw = String::new();
    stream.read_to_string(&mut raw).unwrap();
    let (head, payload) = raw.split_once("\r\n\r\n").expect("http response");
    let status: u16 = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|c| c.parse().ok())
        .expect("status");
    (
        status,
        serde_json::from_str(payload).unwrap_or(serde_json::Value::Null),
    )
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

#[test]
fn typed_client_expectations_hold_over_live_serve() {
    let (_dir, root) = fixture();
    let (_guard, port, token) = start_serve(&root);
    let scope = root.to_string_lossy().replace('\\', "/");

    // --- S49 divergence 1: as-of and diff accept ms timestamps ----------------
    let t = now_ms();
    let (status, asof) = http(
        port,
        "GET",
        &format!("/graph/asof?scope={}&t={t}", urlencode(&scope)),
        &token,
        None,
    );
    assert_eq!(status, 200, "ms timestamp accepted on asof: {asof}");
    assert!(
        asof["data"]["nodes"]
            .as_array()
            .is_some_and(|n| !n.is_empty()),
        "as-of at now resolves the latest commit's corpus"
    );
    let (status, diff) = http(
        port,
        "GET",
        &format!("/graph/diff?scope={}&from=HEAD~1&to={t}", urlencode(&scope)),
        &token,
        None,
    );
    assert_eq!(status, 200, "ms timestamp accepted on diff: {diff}");
    assert!(
        diff["data"]["deltas"]
            .as_array()
            .is_some_and(|d| !d.is_empty()),
        "T1→now diff carries the plan addition"
    );
    // Revisions keep working (revision-first resolution).
    let (status, _) = http(
        port,
        "GET",
        &format!("/graph/asof?scope={}&t=HEAD~1", urlencode(&scope)),
        &token,
        None,
    );
    assert_eq!(status, 200, "revision form still accepted");

    // S50 follow-up: asof in the FEATURE species — a historical keyframe that
    // matches the live constellation (feature nodes + meta-edges), not a
    // disjoint document graph, so the constellation can time-travel cheaply.
    let (status, hist) = http(
        port,
        "GET",
        &format!(
            "/graph/asof?scope={}&t={t}&granularity=feature",
            urlencode(&scope)
        ),
        &token,
        None,
    );
    assert_eq!(status, 200, "feature-granularity asof served: {hist}");
    let hnodes = hist["data"]["nodes"]
        .as_array()
        .expect("asof feature nodes");
    assert!(
        !hnodes.is_empty() && hnodes.iter().all(|n| n["kind"] == "feature"),
        "historical constellation is feature-species, matching live"
    );
    assert!(
        hist["data"]["meta_edges"].is_array(),
        "feature-granularity asof carries constellation meta-edges"
    );
    // S50 keyframe seq anchor: a historical (as_of) keyframe has NO live
    // position, so last_seq is null — the client knows not to resume a stream.
    assert!(
        hist["data"]["last_seq"].is_null(),
        "as_of keyframe carries last_seq: null (no live position): {hist}"
    );

    // --- S49 divergence 2: feature granularity synthesizes the convergence ---
    let (status, constellation) = http(
        port,
        "POST",
        "/graph/query",
        &token,
        Some(&format!(
            r#"{{"scope": "{scope}", "granularity": "feature"}}"#
        )),
    );
    assert_eq!(status, 200);
    let nodes = constellation["data"]["nodes"].as_array().expect("nodes");
    assert!(
        !nodes.is_empty(),
        "feature granularity synthesizes nodes (D4.1), never empty"
    );
    assert!(
        nodes.iter().all(|n| n["kind"] == "feature"),
        "constellation nodes are feature convergences"
    );
    let conf = nodes
        .iter()
        .find(|n| n["id"] == "feature:conf-feature")
        .expect("feature:conf-feature synthesized");
    assert!(
        conf["member_count"].as_u64().is_some_and(|c| c >= 2),
        "convergence counts its evidence documents"
    );
    assert!(
        conf["degree_by_tier"].is_object(),
        "feature nodes carry the degree projection"
    );
    // node-visual-richness P01: the synthesized convergence carries the same two
    // additive status fields — a live feature is in-flight (affirmed).
    assert_eq!(
        conf["status_value"], "in_flight",
        "a live feature convergence is in-flight"
    );
    assert_eq!(
        conf["status_class"], "affirmed",
        "in-flight -> affirmed treatment class"
    );
    // Constellation meta-edges (cross-feature ribbons) AGGREGATE document-document
    // edges. STRICT reference-only graph (user ruling, 2026-06-28): the only graph
    // edges are authored `related:` FRONTMATTER references, served by the DECLARED
    // tier. This conformance fixture is a bare `.vault/` worktree with NO
    // `.vaultspec/`, so core's declared tier cannot run here (the graph is
    // structural-NODE-only, edgeless), and the former cross-feature ribbon came
    // from an in-body `[[wiki-link]]` mention — now forbidden as graph fact. So
    // meta_edges is correctly EMPTY in this core-less fixture; the wire SHAPE
    // contract still holds (an array) and any entry present addresses feature NODE
    // IDS. Non-empty cross-feature ribbon synthesis from reference edges is covered
    // by the engine-query unit test `feature_granularity_returns_meta_edges_not_doc_edges`.
    let metas = constellation["data"]["meta_edges"]
        .as_array()
        .expect("meta_edges is an array (shape contract)");
    assert!(
        metas.iter().all(
            |m| m["src"].as_str().is_some_and(|s| s.starts_with("feature:"))
                && m["dst"].as_str().is_some_and(|s| s.starts_with("feature:"))
        ),
        "any meta-edge present addresses feature NODE IDS, not bare tags"
    );

    // --- S50: the constellation rides the single monotonic delta clock --------
    // A LIVE feature keyframe anchors the stream: numeric last_seq = clock tip,
    // so a held constellation resumes from exactly here without refetching.
    assert!(
        constellation["data"]["last_seq"].as_u64().is_some(),
        "live feature keyframe carries a numeric last_seq: {constellation}"
    );
    // Document deltas (the default diff above) self-declare their species...
    assert!(
        diff["data"]["deltas"]
            .as_array()
            .is_some_and(|d| d.iter().all(|e| e["granularity"] == "document")),
        "document diff entries are tagged granularity=document: {diff}"
    );
    // ...and a feature-granularity diff projects the constellation delta on the
    // SAME wire shape, every entry tagged feature.
    let (status, fdiff) = http(
        port,
        "GET",
        &format!(
            "/graph/diff?scope={}&from=HEAD~1&to={t}&granularity=feature",
            urlencode(&scope)
        ),
        &token,
        None,
    );
    assert_eq!(status, 200, "feature-granularity diff served: {fdiff}");
    assert!(
        fdiff["data"]["deltas"]
            .as_array()
            .is_some_and(|d| d.iter().all(|e| e["granularity"] == "feature")),
        "every feature diff entry is tagged granularity=feature: {fdiff}"
    );

    // --- S49 divergence 3: contract §4 fields on list-shape nodes -------------
    let (status, docs) = http(
        port,
        "POST",
        "/graph/query",
        &token,
        Some(&format!(r#"{{"scope": "{scope}"}}"#)),
    );
    assert_eq!(status, 200);
    let plan_node = docs["data"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "doc:2026-06-13-conf-plan")
        .expect("plan doc node")
        .clone();
    assert_eq!(
        plan_node["title"], "conf plan title",
        "title extracted from the body H1"
    );
    assert_eq!(
        plan_node["dates"]["created"], "2026-06-13",
        "created from frontmatter date"
    );
    assert!(
        plan_node["dates"]["modified"].is_number(),
        "modified carried (ms)"
    );
    assert!(
        plan_node["degree_by_tier"].is_object(),
        "degree projection on the LIST shape, not only detail"
    );
    assert_eq!(
        plan_node["doc_type"], "plan",
        "doc_type from the vault subdir"
    );
    assert!(
        plan_node["lifecycle"]["progress"]["done"].is_number(),
        "plan lifecycle progress on the list shape"
    );

    // --- graph-node-semantics: the ADDITIVE ontology wire fields --------------
    // The node gains authority_class (the register) and an aggregate hint, both
    // additive and never re-keying the node (the §4 id is unchanged).
    assert_eq!(
        plan_node["authority_class"], "roadmap",
        "plan maps to the roadmap authority register"
    );
    assert_eq!(
        plan_node["aggregate"], false,
        "a plan is individually weighted, not an aggregate species"
    );
    assert_eq!(
        plan_node["id"], "doc:2026-06-13-conf-plan",
        "additive ontology fields leave the node id untouched"
    );
    // The ADR node carries its design register.
    let adr_node = docs["data"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "doc:2026-06-13-conf-adr")
        .expect("adr doc node")
        .clone();
    assert_eq!(
        adr_node["authority_class"], "design",
        "an ADR is design authority"
    );

    // --- node-visual-richness P01: the per-type status wire fields ------------
    // status_value (the literal type token) + status_class (the closed
    // treatment family) ride additively on the document node, projected
    // read-and-infer from the parsed lifecycle. A type with no status machine
    // (exec) carries NEITHER field — honest absence.
    let node_by_id = |id: &str| {
        docs["data"]["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["id"] == id)
            .unwrap_or_else(|| panic!("{id} node listed in {docs}"))
            .clone()
    };
    // ADR `accepted` -> affirmed.
    assert_eq!(adr_node["status_value"], "accepted", "ADR H1 status token");
    assert_eq!(adr_node["status_class"], "affirmed", "accepted -> affirmed");
    // ADR `proposed` -> provisional.
    let adr_two = node_by_id("doc:2026-06-13-conf-adr-two");
    assert_eq!(adr_two["status_value"], "proposed");
    assert_eq!(
        adr_two["status_class"], "provisional",
        "proposed -> provisional"
    );
    // Plan tier `L2` -> tiered, with the ordinal in the value; progress stays a
    // SEPARATE channel (the plan still carries lifecycle.progress).
    assert_eq!(
        plan_node["status_value"], "L2",
        "plan tier ordinal in the value"
    );
    assert_eq!(plan_node["status_class"], "tiered", "plan tier -> tiered");
    assert!(
        plan_node["lifecycle"]["progress"]["done"].is_number(),
        "the checkbox progress is a separate channel from the tiered status"
    );
    // Audit worst severity `high` -> graded.
    let audit_node = node_by_id("doc:2026-06-13-conf-audit");
    assert_eq!(audit_node["status_value"], "high", "audit worst severity");
    assert_eq!(audit_node["status_class"], "graded", "severity -> graded");
    // Rule `superseded` -> retired (the native vault rule doc_type).
    let rule_node = node_by_id("doc:2026-06-13-conf-rule");
    assert_eq!(
        rule_node["status_value"], "superseded",
        "rule successor signal"
    );
    assert_eq!(
        rule_node["status_class"], "retired",
        "superseded -> retired"
    );
    // Exec: a type with no per-type status machine -> BOTH fields absent.
    let exec_node = node_by_id("doc:2026-06-13-conf-S01");
    assert!(
        exec_node.get("status_value").is_none(),
        "an exec record carries no status_value (honest absence): {exec_node}"
    );
    assert!(
        exec_node.get("status_class").is_none(),
        "an exec record carries no status_class (honest absence): {exec_node}"
    );

    // STRICT reference-only graph (user ruling, 2026-06-28): the served graph
    // carries ONLY authored `related:` FRONTMATTER references (declared tier). This
    // conformance fixture is a bare `.vault/` worktree with NO `.vaultspec/`, so the
    // declared tier cannot run, and its documents' cross-references are all in-body
    // `[[wiki-link]]` MENTIONS — now forbidden as graph fact. So the served edge set
    // is EMPTY: the plan body's `see [[conf-adr]]` mention that once produced a
    // plan -> adr structural edge is no longer graphed. (Edge `derivation` labeling
    // rides on reference edges and is covered by the engine-query `derivation_labeling`
    // unit test.)
    let edges = docs["data"]["edges"]
        .as_array()
        .expect("edges array (shape contract)");
    assert!(
        edges.is_empty(),
        "in-body wiki-link mentions are NOT served as graph edges (strict reference-only): {docs}"
    );
    // Every edge carries the `derivation` key (null when no pipeline shape) —
    // the field is unconditionally part of the additive §4 edge view.
    assert!(
        docs["data"]["edges"]
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e.get("derivation").is_some()),
        "every edge view carries the additive derivation key"
    );
    // The additive fields ride through the SHARED envelope: tiers present on
    // this success response (every-wire-response-carries-the-tiers-block).
    assert!(
        docs["tiers"].is_object(),
        "the success envelope carries the tiers block"
    );
    // S50: a LIVE document keyframe also anchors the clock (numeric last_seq),
    // so both species resume on the single monotonic clock.
    assert!(
        docs["data"]["last_seq"].as_u64().is_some(),
        "live document keyframe carries a numeric last_seq too"
    );

    // --- S49 divergence 4: /status git block + /vault-tree dates/doc_type -----
    let (status, st) = http(port, "GET", "/status", &token, None);
    assert_eq!(status, 200);
    assert!(
        st["data"]["git"]["dirty"].is_boolean() && st["data"]["git"]["head_ref"].is_string(),
        "serve /status carries the git block (front-door parity)"
    );
    let (status, tree) = http(
        port,
        "GET",
        &format!("/vault-tree?scope={}", urlencode(&scope)),
        &token,
        None,
    );
    assert_eq!(status, 200);
    let entry = tree["data"]["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["stem"] == "2026-06-13-conf-plan")
        .expect("plan entry")
        .clone();
    assert_eq!(entry["doc_type"], "plan", "doc_type server-side");
    assert_eq!(entry["dates"]["created"], "2026-06-13", "dates server-side");
    // Plan checkbox progress projected onto the vault-tree entry from the SAME
    // lifecycle facet the node-graph pipeline reads (dashboard-pipeline-wire):
    // the conf plan has `[x] S01` + `[ ] S02` => done 1 / total 2 (in-progress),
    // so the left rail's plan-status pip lights up from real lifecycle truth.
    assert_eq!(
        entry["progress"]["done"], 1,
        "vault-tree plan progress done from the lifecycle facet"
    );
    assert_eq!(
        entry["progress"]["total"], 2,
        "vault-tree plan progress total from the lifecycle facet"
    );
    // The plan also forwards its tier facet; a non-plan entry carries no progress.
    assert_eq!(
        entry["tier"], "L2",
        "vault-tree forwards the plan tier facet"
    );
    let research_entry = tree["data"]["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["doc_type"] == "audit")
        .cloned();
    if let Some(audit) = research_entry {
        assert!(
            audit["progress"].is_null(),
            "a non-plan entry carries no checkbox progress (truthful absence)"
        );
    }

    // --- S49 divergence 5: bounded commit-event node_ids ----------------------
    let (status, events) = http(
        port,
        "GET",
        &format!("/events?scope={}", urlencode(&scope)),
        &token,
        None,
    );
    assert_eq!(status, 200);
    let raws = events["data"]["payload"]["events"]
        .as_array()
        .expect("raw events");
    for event in raws {
        let ids = event["node_ids"].as_array().unwrap();
        let code_ids = ids
            .iter()
            .filter(|i| i.as_str().is_some_and(|s| s.starts_with("code:")))
            .count();
        assert!(code_ids <= 20, "code ids capped at the recorded bound (20)");
    }
    // Doc ids always survive the bound — they are the join key.
    assert!(
        raws.iter().any(|e| {
            e["node_ids"]
                .as_array()
                .is_some_and(|ids| ids.iter().any(|i| i == "doc:2026-06-13-conf-plan"))
        }),
        "doc ids never truncated"
    );
    // Event id (the monotonic seq) tracks time order: a stream splicing by
    // `since=<id>` relies on it (sweep LOW, 2026-06-13 — ids were assigned from
    // newest-first walk order then re-sorted by ts, anti-correlating id and ts).
    let pairs: Vec<(u64, i64)> = raws
        .iter()
        .map(|e| {
            let id = e["id"].as_str().unwrap().strip_prefix("ev:").unwrap();
            (id.parse().unwrap(), e["ts"].as_i64().unwrap())
        })
        .collect();
    for w in pairs.windows(2) {
        assert!(
            w[0].0 < w[1].0 && w[0].1 <= w[1].1,
            "event id and ts both ascend together: {pairs:?}"
        );
    }
}

/// Error-surface conformance (adversarial findings, 2026-06-13): EVERY wire
/// error carries the tiers block — including framework-boundary rejections
/// that fire before any handler (defect 1) — and revision-parse errors never
/// leak build internals (defect 2).
#[test]
fn error_surface_carries_tiers_and_hides_internals() {
    let (_dir, root) = fixture();
    let (_guard, port, token) = start_serve(&root);
    let scope = root.to_string_lossy().replace('\\', "/");

    // Defect 1 — the tiers block rides framework-boundary errors:
    // malformed JSON body (Json extractor rejection) -> 400.
    let (status, body) = http(port, "POST", "/graph/query", &token, Some("{bad"));
    assert_eq!(status, 400, "malformed body: {body}");
    assert!(
        body["tiers"].is_object(),
        "malformed-body 400 carries tiers"
    );
    // missing required query param (Query extractor rejection) -> 400.
    let (status, body) = http(port, "GET", "/vault-tree", &token, None);
    assert_eq!(status, 400);
    assert!(body["tiers"].is_object(), "missing-param 400 carries tiers");
    // wrong method (router rejection) -> 405.
    let (status, body) = http(port, "GET", "/graph/query", &token, None);
    assert_eq!(status, 405);
    assert!(body["tiers"].is_object(), "405 carries tiers");
    // no/!bad auth (gate rejection) -> 401.
    let (status, body) = http(port, "GET", "/status", "", None);
    assert_eq!(status, 401);
    assert!(body["tiers"].is_object(), "401 carries tiers");

    // Defect 2 — an unparseable revision is sanitized, no build internals.
    let (status, body) = http(
        port,
        "POST",
        "/graph/query",
        &token,
        Some(&format!(r#"{{"scope":"{scope}","as_of":"not-a-rev"}}"#)),
    );
    assert_eq!(status, 400);
    assert!(
        body["tiers"].is_object(),
        "revision-error 400 carries tiers"
    );
    let err = body["error"].as_str().unwrap_or("");
    assert!(
        !err.contains(".cargo") && !err.contains("gix-revision") && !err.contains(".rs:"),
        "revision error must not leak build internals: {err}"
    );
    assert!(err.contains("invalid revision"), "names the failure: {err}");

    // Hardening: an absurd neighbor depth is clamped server-side (never an
    // unbounded whole-component dump) and equals the capped walk.
    let huge = http(
        port,
        "GET",
        "/nodes/doc:2026-06-13-conf-plan/neighbors?depth=999999",
        &token,
        None,
    );
    assert_eq!(huge.0, 200, "huge depth served (clamped), not an error");
    let capped = http(
        port,
        "GET",
        "/nodes/doc:2026-06-13-conf-plan/neighbors?depth=4",
        &token,
        None,
    );
    assert_eq!(
        huge.1["data"]["ego"], capped.1["data"]["ego"],
        "depth beyond the cap yields the same bounded ego as the cap"
    );
}

/// Session + settings conformance (user-state-persistence W03.P07.S23): the
/// top-level orchestration surface carries the tiers block on every response,
/// roundtrips a PUT through a GET, and rejects an unknown scope with a tiered
/// 400 — the exact contract W04's client and mock must mirror.
#[test]
fn session_and_settings_surface_roundtrips_and_carries_tiers() {
    let (_dir, root) = fixture();
    let (_guard, port, token) = start_serve(&root);
    let scope = root.to_string_lossy().replace('\\', "/");

    // --- GET /session: shape + tiers ----------------------------------------
    let (status, session) = http(port, "GET", "/session", &token, None);
    assert_eq!(status, 200, "GET /session: {session}");
    assert!(
        session["tiers"].is_object(),
        "GET /session carries the tiers block"
    );
    let data = &session["data"];
    assert!(data["workspace"].is_string(), "workspace token present");
    assert_eq!(
        data["active_scope"].as_str(),
        Some(scope.as_str()),
        "active scope is the launch worktree before any switch"
    );
    assert!(
        data["scope_context"]["folder"].is_null(),
        "no folder selected by default"
    );
    assert!(
        data["scope_context"]["feature_tags"]
            .as_array()
            .is_some_and(|t| t.is_empty()),
        "no feature-tag contexts by default"
    );
    assert!(
        data["recents"].as_array().is_some(),
        "recents is an array (possibly empty)"
    );

    // --- GET /settings: shape + tiers ---------------------------------------
    let (status, settings) = http(port, "GET", "/settings", &token, None);
    assert_eq!(status, 200, "GET /settings: {settings}");
    assert!(
        settings["tiers"].is_object(),
        "GET /settings carries the tiers block"
    );
    assert!(
        settings["data"]["global"].is_object(),
        "global settings is a map"
    );
    assert!(
        settings["data"]["scoped"].is_object(),
        "scoped settings is a map"
    );
    // Before any USER settings write, the only global-settings key is the
    // engine-managed `active_workspace` pointer, which the launch path seeds
    // into the global kv surface (workspace-registry: active_workspace lives in
    // the global-settings surface, session.rs). No user-authored keys are
    // present yet.
    assert!(
        settings["data"]["global"]
            .as_object()
            .is_some_and(|m| { m.keys().all(|k| k == "active_workspace") }),
        "no user global settings before any write: {}",
        settings["data"]["global"]
    );

    // --- PUT /session: set scope_context + push_recent, read it back --------
    let (status, updated) = http(
        port,
        "PUT",
        "/session",
        &token,
        Some(&format!(
            r#"{{"scope_context": {{"folder": "plan", "feature_tags": ["conf-feature"]}},
                 "push_recent": "{scope}"}}"#
        )),
    );
    assert_eq!(status, 200, "PUT /session: {updated}");
    assert!(updated["tiers"].is_object(), "PUT /session carries tiers");
    // The PUT response itself reflects the update (it returns the session).
    assert_eq!(
        updated["data"]["scope_context"]["folder"].as_str(),
        Some("plan"),
        "PUT response echoes the persisted folder"
    );
    assert_eq!(
        updated["data"]["scope_context"]["feature_tags"][0].as_str(),
        Some("conf-feature"),
        "PUT response echoes the persisted feature tags"
    );
    assert_eq!(
        updated["data"]["recents"][0].as_str(),
        Some(scope.as_str()),
        "the pushed value is at the front of recents"
    );
    // A FRESH GET sees the same persisted state (true roundtrip through the
    // store, not just the PUT's own echo).
    let (status, reread) = http(port, "GET", "/session", &token, None);
    assert_eq!(status, 200);
    assert_eq!(
        reread["data"]["scope_context"]["folder"].as_str(),
        Some("plan"),
        "GET after PUT reads the persisted folder back"
    );
    assert_eq!(
        reread["data"]["scope_context"]["feature_tags"][0].as_str(),
        Some("conf-feature"),
        "GET after PUT reads the persisted feature tags back"
    );

    // --- PUT /settings: a global key, read it back --------------------------
    let (status, set) = http(
        port,
        "PUT",
        "/settings",
        &token,
        Some(r#"{"key": "theme", "value": "dark"}"#),
    );
    assert_eq!(status, 200, "PUT /settings: {set}");
    assert!(set["tiers"].is_object(), "PUT /settings carries tiers");
    assert_eq!(
        set["data"]["global"]["theme"].as_str(),
        Some("dark"),
        "PUT /settings response echoes the persisted global key"
    );
    // A scoped key on the active (warm) scope, read back under that scope. The
    // key must be a registry-declared, scope-eligible setting now that writes
    // are validated (dashboard-settings); `default_granularity` is exactly that.
    let (status, scoped) = http(
        port,
        "PUT",
        "/settings",
        &token,
        Some(&format!(
            r#"{{"scope": "{scope}", "key": "default_granularity", "value": "document"}}"#
        )),
    );
    assert_eq!(status, 200, "PUT scoped setting: {scoped}");
    assert_eq!(
        scoped["data"]["scoped"][&scope]["default_granularity"].as_str(),
        Some("document"),
        "scoped key surfaces under its scope in the settings map"
    );
    // Fresh GET sees both the global and the scoped key persisted.
    let (status, allset) = http(port, "GET", "/settings", &token, None);
    assert_eq!(status, 200);
    assert_eq!(
        allset["data"]["global"]["theme"].as_str(),
        Some("dark"),
        "global setting persisted across a fresh GET"
    );
    assert_eq!(
        allset["data"]["scoped"][&scope]["default_granularity"].as_str(),
        Some("document"),
        "scoped setting persisted across a fresh GET"
    );

    // --- GET /settings/schema: the served registry --------------------------
    // (dashboard-settings) The schema is the single source of truth the client
    // renders from. It rides the shared envelope (tiers present), lists declared
    // settings with their type/control/default, and orders the groups.
    let (status, schema) = http(port, "GET", "/settings/schema", &token, None);
    assert_eq!(status, 200, "GET /settings/schema: {schema}");
    assert!(
        schema["tiers"].is_object(),
        "GET /settings/schema carries the tiers block"
    );
    let defs = schema["data"]["settings"]
        .as_array()
        .expect("schema carries a settings array");
    assert!(!defs.is_empty(), "the registry is non-empty");
    let theme_def = defs
        .iter()
        .find(|d| d["key"] == "theme")
        .expect("theme is a declared setting");
    assert_eq!(theme_def["value_type"]["type"], "enum", "theme is an enum");
    assert!(
        theme_def["value_type"]["members"]
            .as_array()
            .is_some_and(|m| m.iter().any(|v| v == "dark")),
        "theme enum members include dark"
    );
    assert_eq!(
        theme_def["control"], "segmented",
        "theme renders as segmented"
    );
    assert_eq!(theme_def["default"], "system", "theme default is system");
    assert_eq!(
        theme_def["scope_eligible"], false,
        "theme is global-only (not scope-eligible)"
    );
    assert!(
        schema["data"]["groups"]
            .as_array()
            .is_some_and(|g| g.iter().any(|v| v == "Appearance")),
        "groups are ordered and include Appearance"
    );
    // (dashboard-settings, Figma 17:1702) The Graph section carries five rows:
    // default_granularity plus the confidence-floor percent slider and the
    // label-filter text field, each a real consumed setting (not a dead control).
    let confidence_def = defs
        .iter()
        .find(|d| d["key"] == "confidence_floor")
        .expect("confidence_floor is a declared setting");
    assert_eq!(
        confidence_def["value_type"]["type"], "integer",
        "confidence_floor is an integer (percent)"
    );
    assert_eq!(confidence_def["control"], "slider");
    assert_eq!(confidence_def["unit"], "%");
    assert_eq!(confidence_def["group"], "Graph");
    assert_eq!(confidence_def["scope_eligible"], false);
    let label_def = defs
        .iter()
        .find(|d| d["key"] == "label_filter")
        .expect("label_filter is a declared setting");
    assert_eq!(label_def["value_type"]["type"], "string");
    assert_eq!(label_def["control"], "text");
    assert_eq!(label_def["group"], "Graph");
    // Both new settings validate on PUT: a percent in range and a stem string.
    let (status, _) = http(
        port,
        "PUT",
        "/settings",
        &token,
        Some(r#"{"key": "confidence_floor", "value": "60"}"#),
    );
    assert_eq!(status, 200, "confidence_floor accepts an in-range percent");
    let (status, _) = http(
        port,
        "PUT",
        "/settings",
        &token,
        Some(r#"{"key": "label_filter", "value": "adr"}"#),
    );
    assert_eq!(status, 200, "label_filter accepts a stem string");

    // --- PUT /settings validation: typed rejections -------------------------
    // (dashboard-settings) An unknown key, an out-of-constraint value, and a
    // scope on a global-only setting are each a tiered 400 carrying a
    // machine-readable error_kind — distinguishable from a tier being down.
    let (status, unknown) = http(
        port,
        "PUT",
        "/settings",
        &token,
        Some(r#"{"key": "not_a_real_setting", "value": "x"}"#),
    );
    assert_eq!(status, 400, "unknown key is rejected: {unknown}");
    assert!(unknown["tiers"].is_object(), "the 400 carries tiers");
    assert_eq!(
        unknown["error_kind"], "unknown_key",
        "the rejection names the typed kind"
    );
    let (status, badval) = http(
        port,
        "PUT",
        "/settings",
        &token,
        Some(r#"{"key": "theme", "value": "chartreuse"}"#),
    );
    assert_eq!(status, 400, "out-of-enum value is rejected: {badval}");
    assert_eq!(badval["error_kind"], "invalid_value");
    let (status, badscope) = http(
        port,
        "PUT",
        "/settings",
        &token,
        Some(&format!(
            r#"{{"scope": "{scope}", "key": "theme", "value": "dark"}}"#
        )),
    );
    assert_eq!(
        status, 400,
        "scoping a global-only key is rejected: {badscope}"
    );
    assert_eq!(badscope["error_kind"], "scope_not_allowed");
    // A rejected write did not change persisted state: theme is still dark global.
    let (_, after_bad) = http(port, "GET", "/settings", &token, None);
    assert_eq!(
        after_bad["data"]["global"]["theme"].as_str(),
        Some("dark"),
        "a rejected write leaves the prior value intact"
    );

    // --- PUT /session with an unknown scope -> tiered 400 -------------------
    let (status, bad) = http(
        port,
        "PUT",
        "/session",
        &token,
        Some(r#"{"active_scope": "/no/such/worktree"}"#),
    );
    assert_eq!(status, 400, "unknown active_scope is a 400: {bad}");
    assert!(
        bad["tiers"].is_object(),
        "the unknown-scope 400 still carries the tiers block"
    );
    assert!(
        bad["error"]
            .as_str()
            .is_some_and(|e| e.contains("worktree")),
        "the 400 names the unselectable scope: {bad}"
    );
    // The failed switch did NOT change the active scope.
    let (_, after) = http(port, "GET", "/session", &token, None);
    assert_eq!(
        after["data"]["active_scope"].as_str(),
        Some(scope.as_str()),
        "a rejected scope switch leaves the active scope unchanged"
    );
}

fn urlencode(s: &str) -> String {
    s.replace(':', "%3A").replace('/', "%2F")
}
