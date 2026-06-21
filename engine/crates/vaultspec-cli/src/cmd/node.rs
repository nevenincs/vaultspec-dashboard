//! `vaultspec node <id> [--context] [--tiers …]` — node detail or full
//! context assembly (D4.4: a pure serializable read).

use engine_model::{NodeId, Tier};
use serde_json::{Value, json};

use super::{CliError, Ctx};

fn parse_tiers(tiers: &[String]) -> Result<Vec<Tier>, CliError> {
    tiers
        .iter()
        .map(|t| match t.as_str() {
            "declared" => Ok(Tier::Declared),
            "structural" => Ok(Tier::Structural),
            "temporal" => Ok(Tier::Temporal),
            // `semantic` is NOT a graph tier (D3.5): it falls through to the
            // unknown-tier rejection like any other unknown tier string.
            other => Err(CliError::Other(format!("unknown tier `{other}`"))),
        })
        .collect()
}

pub fn run(ctx: &Ctx, id: &str, context: bool, tiers: &[String]) -> Result<Value, CliError> {
    let wanted = parse_tiers(tiers)?;
    let (graph, _stats) = ctx.indexed_graph()?;
    let node_id = NodeId(id.to_string());

    let Some(detail) = engine_query::node::node_detail(&graph, &node_id) else {
        return Err(CliError::Other(format!("unknown node `{id}`")));
    };

    if context {
        let mut bundle =
            serde_json::to_value(&detail.bundle).map_err(|e| CliError::Other(e.to_string()))?;
        // --tiers narrows the context's edge groups to the named tiers.
        if !wanted.is_empty()
            && let Some(groups) = bundle
                .get_mut("edges_by_tier")
                .and_then(Value::as_object_mut)
        {
            let names: Vec<&str> = wanted.iter().map(|t| t.as_str()).collect();
            groups.retain(|tier, _| names.contains(&tier.as_str()));
        }
        let evidence = engine_query::node::evidence(&graph, &node_id);
        Ok(json!({"context": bundle, "evidence": evidence}))
    } else {
        Ok(json!({
            "node": detail.bundle.node,
            "degree_by_tier": detail.bundle.degree_by_tier,
            "neighbors": detail.bundle.neighbors,
        }))
    }
}
