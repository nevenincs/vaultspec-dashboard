//! Search transport (rag-control-plane ADR D1, rag-integration-hardening D1):
//! `/search` rides the resident rag service over the bounded loopback HTTP
//! transport, exactly like the control verbs (`control.rs`) and the embedding
//! scroll (`vectors.rs`). This module carries ZERO search semantics
//! (`engine-read-and-infer`): the engine-built request body transits to rag
//! VERBATIM and rag's flat response envelope returns VERBATIM as a
//! `serde_json::Value`. Argument validation/bounding, the node-id annotation,
//! and the `tiers` block are the BROKER's job (`vaultspec-api routes/ops.rs`),
//! never this transport's.

use serde_json::Value;

use crate::client::{RagError, RagTransport, Result};

/// POST the engine-built search body to rag's `/search` on the resident service
/// and return rag's response envelope verbatim. The body is forwarded exactly as
/// the broker built it (rag's `{query, type, project_root, top_k, ...}`
/// vocabulary); the flat response envelope (`{request_id, results, summary,
/// timing, index_state, ...}`) parses back to a `Value` untouched. A non-JSON
/// body (a future shape change) is a typed error the broker degrades the tier
/// on, never a silent empty — mirroring `control::parse`.
pub fn http_search(transport: &impl RagTransport, body: &Value) -> Result<Value> {
    let raw = transport.post_json("/search", &body.to_string())?;
    Ok(serde_json::from_str(&raw)?)
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
    use serde_json::json;

    #[test]
    fn body_transits_verbatim_and_envelope_returns_verbatim() {
        // rag's real flat envelope: results at the top level, no CLI `{ok,
        // command, data}` nesting. Every field must survive untouched — the
        // crate adds nothing.
        let transport = FakeTransport::returning(vec![
            r#"{"request_id": "r-1", "summary": "2 hits",
                "results": [
                    {"id": "a", "path": ".vault/plan/x.md", "source": "vault", "score": 0.9},
                    {"id": "b", "path": "frontend/src/main.tsx", "source": "codebase", "score": 0.5}
                ],
                "index_state": {"status": "ready", "indexed_count": 12},
                "timing": {"total_ms": 7}}"#,
        ]);
        let body = json!({
            "query": "graph",
            "type": "vault",
            "project_root": "Y:\\code\\proj",
            "top_k": 20
        });
        let out = http_search(&transport, &body).unwrap();

        // The envelope returns byte-for-byte equal to what rag said.
        let expected: Value = serde_json::from_str(
            r#"{"request_id": "r-1", "summary": "2 hits",
                "results": [
                    {"id": "a", "path": ".vault/plan/x.md", "source": "vault", "score": 0.9},
                    {"id": "b", "path": "frontend/src/main.tsx", "source": "codebase", "score": 0.5}
                ],
                "index_state": {"status": "ready", "indexed_count": 12},
                "timing": {"total_ms": 7}}"#,
        )
        .unwrap();
        assert_eq!(out, expected, "rag's flat envelope returns verbatim");

        // The request body transited to /search exactly as the broker built it.
        let call = &transport.calls.borrow()[0];
        assert_eq!(call.0, "/search", "posts to rag's /search route");
        assert_eq!(
            serde_json::from_str::<Value>(&call.1).unwrap(),
            body,
            "the engine-built body transits verbatim"
        );
    }

    #[test]
    fn transport_error_propagates_typed_for_broker_degradation() {
        // A transport-level failure is a typed RagError the broker maps to a
        // degraded tier — never an Ok masking the fault.
        let transport = FakeTransport::returning(vec![]);
        let err = http_search(&transport, &json!({"query": "x"})).unwrap_err();
        assert!(matches!(err, RagError::Protocol));
    }

    #[test]
    fn a_non_json_body_is_a_typed_error_not_a_silent_empty() {
        let transport = FakeTransport::returning(vec!["<html>bad gateway</html>"]);
        let err = http_search(&transport, &json!({"query": "x"})).unwrap_err();
        assert!(matches!(err, RagError::ServiceJson(_)));
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
