//! Search forwarding (contract §8, D5.2): the engine carries **no search
//! semantics** — rag's request vocabulary and response envelope transit
//! verbatim. The single engine value-add: every result is annotated with
//! the engine node id it maps to, so results click through into the graph.

use engine_model::NodeId;
use serde_json::Value;

use crate::client::{RagError, RagTransport, Result};

/// Map a rag source to an engine node id: vault stems → document nodes,
/// paths → code-artifact nodes (the same correlation the event log uses).
pub fn target_node_id(source: &str) -> NodeId {
    use engine_model::{CanonicalKey, node_id};
    let trimmed = source.trim_start_matches("./");
    if let Some(stem) = trimmed
        .strip_prefix(".vault/")
        .and_then(|rest| rest.split('/').next_back())
        .and_then(|file| file.strip_suffix(".md"))
    {
        node_id(&CanonicalKey::Document { stem })
    } else if !trimmed.contains('/') && !trimmed.contains('.') {
        // Bare stem (rag vault hits report stems, not paths).
        node_id(&CanonicalKey::Document { stem: trimmed })
    } else {
        node_id(&CanonicalKey::CodeArtifact {
            path: trimmed,
            symbol: None,
        })
    }
}

/// Forward a search request body to rag verbatim and annotate each result
/// with `node_id`. Everything else in the envelope passes through intact.
pub fn forward_search(transport: &impl RagTransport, request_body: &str) -> Result<Value> {
    let raw = transport.post_json("/search", request_body)?;
    let mut envelope: Value = serde_json::from_str(&raw)?;

    if let Some(results) = envelope
        .pointer_mut("/data/results")
        .and_then(Value::as_array_mut)
    {
        for result in results {
            let node_id = result
                .get("source")
                .and_then(Value::as_str)
                .map(|source| target_node_id(source).0);
            if let Some(obj) = result.as_object_mut() {
                obj.insert(
                    "node_id".to_string(),
                    node_id.map(Value::String).unwrap_or(Value::Null),
                );
            }
        }
    }
    Ok(envelope)
}

/// Map a transport-level failure to the truthful degradation reason the
/// per-response tier block carries (contract §2/§8).
pub fn degradation_reason(error: &RagError) -> String {
    match error {
        RagError::Io(_) => "rag service down (connection failed)".to_string(),
        RagError::Http { status, .. } => format!("rag responded {status}"),
        _ => "rag response unreadable".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::test_support::FakeTransport;

    #[test]
    fn results_are_annotated_with_node_ids_and_envelope_passes_verbatim() {
        let transport = FakeTransport::returning(vec![
            r#"{"ok": true, "command": "search", "custom_field": "untouched",
                "data": {"results": [
                    {"source": ".vault/plan/2026-06-12-y-plan.md", "score": 0.9},
                    {"source": "frontend/src/main.tsx", "score": 0.5},
                    {"score": 0.1}
                ]}}"#,
        ]);
        let out = forward_search(&transport, r#"{"query": "graph", "type": "vault"}"#).unwrap();

        // Verbatim pass-through of everything rag said.
        assert_eq!(out["custom_field"], "untouched");
        assert_eq!(out["ok"], true);

        let results = out["data"]["results"].as_array().unwrap();
        assert_eq!(results[0]["node_id"], "doc:2026-06-12-y-plan");
        assert_eq!(results[1]["node_id"], "code:frontend/src/main.tsx");
        assert_eq!(
            results[2]["node_id"],
            Value::Null,
            "sourceless hit: null, not missing"
        );

        // The request body transited untouched.
        assert_eq!(
            transport.calls.borrow()[0].1,
            r#"{"query": "graph", "type": "vault"}"#
        );
    }

    #[test]
    fn transport_failures_map_to_truthful_degradation_reasons() {
        let io = RagError::Io(std::io::Error::other("refused"));
        assert!(degradation_reason(&io).contains("down"));
        let http = RagError::Http {
            status: 502,
            body: String::new(),
        };
        assert!(degradation_reason(&http).contains("502"));
    }
}
