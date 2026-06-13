//! The shared `--json` envelope (engine-spec D6.2): core's result
//! vocabulary, so agents already fluent in the siblings parse the engine
//! for free. Shape: `{ok, command, status, data | error+message}` plus the
//! contract §2 per-tier degradation block.

use serde_json::{Value, json};

/// Success envelope.
pub fn ok(command: &str, data: Value, tiers: Value) -> Value {
    json!({
        "ok": true,
        "command": command,
        "status": "success",
        "data": data,
        "tiers": tiers,
    })
}

/// Failure envelope — carries the tier block too: contract §2 says EVERY
/// response states per-tier availability (audit G1).
pub fn fail(command: &str, error: &str, message: &str, tiers: Value) -> Value {
    json!({
        "ok": false,
        "command": command,
        "status": "failed",
        "error": error,
        "message": message,
        "tiers": tiers,
    })
}

/// Print a payload: pretty JSON in `--json` mode, or hand back for the
/// human renderer.
pub fn emit_json(payload: &Value) {
    println!(
        "{}",
        serde_json::to_string_pretty(payload).expect("serializes")
    );
}

/// The contract §2 tier block as a JSON value with truthful per-tier state:
/// `semantic` reflects rag reachability, `declared` reflects core
/// reachability (the declared tier is ingested from core's graph, so an
/// unreachable core means the engine cannot build it). `structural` and
/// `temporal` derive from git + the working tree the CLI is already reading,
/// so they are available whenever the command runs.
pub fn tiers_json(rag_reason: Option<&str>, declared_reason: Option<&str>) -> Value {
    let tier = |reason: Option<&str>| match reason {
        None => json!({"available": true}),
        Some(reason) => json!({"available": false, "reason": reason}),
    };
    let mut block = serde_json::Map::new();
    block.insert("declared".into(), tier(declared_reason));
    block.insert("structural".into(), json!({"available": true}));
    block.insert("temporal".into(), json!({"available": true}));
    block.insert("semantic".into(), tier(rag_reason));
    Value::Object(block)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelopes_follow_core_vocabulary() {
        let success = ok("map", json!({"x": 1}), tiers_json(None, None));
        assert_eq!(success["status"], "success");
        assert_eq!(success["command"], "map");
        assert!(success["tiers"]["semantic"]["available"].as_bool().unwrap());

        let failure = fail(
            "graph",
            "bad-filter",
            "unknown tier `psychic`",
            tiers_json(None, None),
        );
        assert_eq!(failure["ok"], false);
        assert_eq!(failure["status"], "failed");
        assert!(
            failure["tiers"]["declared"]["available"].is_boolean(),
            "tiers on EVERY response, failures included (contract sec 2)"
        );

        let degraded = tiers_json(Some("rag service down"), None);
        assert_eq!(degraded["semantic"]["available"], false);
        assert_eq!(degraded["declared"]["available"], true);

        // Declared degrades truthfully when core is unreachable.
        let core_down = tiers_json(None, Some("core unreachable"));
        assert_eq!(core_down["declared"]["available"], false);
        assert_eq!(core_down["declared"]["reason"], "core unreachable");
        assert_eq!(core_down["semantic"]["available"], true);
    }
}
