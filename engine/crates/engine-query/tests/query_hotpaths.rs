use std::collections::HashSet;
use std::time::Instant;

use engine_graph::{EdgeAttrs, LinkageGraph, ingest};
use engine_model::{
    CanonicalKey, Dates, Facet, Node, NodeKind, Presence, Provenance, RelationKind,
    ResolutionState, ScopeRef, Tier, edge_id, node_id,
};
use engine_query::filter::Filter;
use engine_query::graph::{Granularity, build_document_views, graph_query, graph_query_cached};

fn scope() -> ScopeRef {
    ScopeRef::Ref {
        name: "main".into(),
    }
}

fn document(i: usize) -> Node {
    let stem = format!("hotpath-{i:04}");
    Node {
        id: node_id(&CanonicalKey::Document { stem: &stem }),
        kind: NodeKind::Document,
        key: stem,
        title: Some(format!("Hotpath fixture {i}")),
        doc_type: Some(["plan", "adr", "research", "exec"][i % 4].into()),
        dates: Some(Dates {
            created: Some(format!("2026-06-{:02}", 1 + (i % 20))),
            modified: Some(1_000_000 + i as i64),
            stamped: None,
        }),
        feature_tags: vec![format!("feature-{}", i % 8)],
        status: (i % 4 == 1).then_some("accepted".into()),
        tier: i.is_multiple_of(4).then_some("L3".into()),
        size: None,
        facets: vec![Facet {
            scope: scope(),
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    }
}

fn fixture(n: usize) -> LinkageGraph {
    let mut graph = LinkageGraph::new();
    for i in 0..n {
        graph.upsert_node(document(i));
    }
    for i in 0..n {
        for step in [1, 7, 17] {
            let j = (i + step) % n;
            let src = format!("hotpath-{i:04}");
            let dst = format!("hotpath-{j:04}");
            let src_id = node_id(&CanonicalKey::Document { stem: &src });
            let dst_id = node_id(&CanonicalKey::Document { stem: &dst });
            let tier = if step == 1 {
                Tier::Declared
            } else {
                Tier::Structural
            };
            let provenance = Provenance::DocumentBody {
                blob_hash: "fixture".into(),
                span: (i, i + 1),
                target: dst,
            };
            let edge = engine_model::Edge {
                id: edge_id(&src_id, &dst_id, &RelationKind::Mentions, tier, &provenance),
                src: src_id,
                dst: dst_id,
                relation: RelationKind::Mentions,
                tier,
                confidence: if tier == Tier::Declared { 1.0 } else { 0.9 },
                state: (tier == Tier::Structural).then_some(ResolutionState::Resolved),
                provenance,
                scope: scope(),
                observed_at: 0,
            };
            ingest(&mut graph, edge, EdgeAttrs::default()).unwrap();
        }
    }
    graph
}

#[test]
fn document_query_hotpath_fixture_reports_projection_and_filtered_query_times() {
    let graph = fixture(640);
    let filter: Filter = serde_json::from_str(
        r#"{"feature_tags":["feature-3"],"doc_types":["exec"],"relations":["mentions"]}"#,
    )
    .unwrap();

    let projection_start = Instant::now();
    let views = build_document_views(&graph, &scope());
    let projection_ms = projection_start.elapsed().as_millis();

    let uncached_start = Instant::now();
    let uncached = graph_query(&graph, &scope(), filter.clone(), Granularity::Document).unwrap();
    let uncached_ms = uncached_start.elapsed().as_millis();

    let cached_start = Instant::now();
    let cached =
        graph_query_cached(&graph, &scope(), filter, Granularity::Document, &views).unwrap();
    let cached_ms = cached_start.elapsed().as_millis();

    eprintln!(
        "query_hotpaths: projection={projection_ms}ms uncached={uncached_ms}ms cached={cached_ms}ms nodes={} edges={}",
        cached.nodes.len(),
        cached.edges.len()
    );

    assert_eq!(
        cached.nodes.len(),
        80,
        "fixture has 1/8 of nodes in feature-3"
    );
    assert!(
        cached.nodes.iter().all(|node| node["feature_tags"]
            .as_array()
            .is_some_and(|tags| tags.iter().any(|tag| tag == "feature-3"))),
        "the filtered slice only contains the requested feature tag"
    );

    let kept: HashSet<&str> = cached
        .nodes
        .iter()
        .filter_map(|node| node["id"].as_str())
        .collect();
    for edge in &cached.edges {
        let src = edge["src"].as_str().expect("edge src");
        let dst = edge["dst"].as_str().expect("edge dst");
        assert!(
            kept.contains(src) && kept.contains(dst),
            "returned edge endpoints must be present in the filtered document slice"
        );
    }

    assert_eq!(
        serde_json::to_value(&uncached).unwrap(),
        serde_json::to_value(&cached).unwrap(),
        "indexed cached query must preserve the production query contract"
    );
}
