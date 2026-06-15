//! `vaultspec graph [--filter …] [--as-of …]` — export the linkage graph
//! as tier-labelled node-link JSON through the shared query core.

use engine_query::filter::Filter;
use engine_query::graph::{Granularity, bound_slice, graph_query};
use serde_json::{Value, json};

use super::{CliError, Ctx};

pub fn run(
    ctx: &Ctx,
    filter_json: Option<&str>,
    as_of: Option<&str>,
    granularity: &str,
) -> Result<Value, CliError> {
    let granularity = match granularity {
        "document" => Granularity::Document,
        "feature" => Granularity::Feature,
        other => {
            return Err(CliError::Other(format!(
                "unknown granularity `{other}` (document|feature)"
            )));
        }
    };
    let filter: Filter = match filter_json {
        Some(raw) => serde_json::from_str(raw)
            .map_err(|e| CliError::Other(format!("filter is not valid JSON: {e}")))?,
        None => Filter::default(),
    };

    let (graph, scope) = match as_of {
        // Blob-true historical view (D7.3): reconstructed at the ref,
        // never from the present working tree.
        Some(reference) => {
            let scope = engine_model::ScopeRef::Ref {
                name: reference.to_string(),
            };
            let graph =
                engine_graph::asof::asof_graph_resolved(&ctx.root, reference, &scope, 0)?.graph;
            (graph, scope)
        }
        None => {
            let (graph, _stats) = ctx.indexed_graph()?;
            (graph, ctx.scope.clone())
        }
    };

    let mut slice = graph_query(&graph, &scope, filter, granularity)?;
    // Bound every front door (graph-queries-are-bounded-by-default): the local
    // CLI export is an engine front door too, so it honors the same node ceiling
    // the HTTP route does, reporting truncation honestly instead of streaming a
    // multi-gigabyte slice.
    let truncated = bound_slice(&mut slice).map(|total| {
        json!({
            "total_nodes": total,
            "returned_nodes": slice.nodes.len(),
            "reason": "graph node ceiling; narrow with a filter (the feature constellation is the smallest view)",
        })
    });
    Ok(json!({
        "as_of": as_of,
        "nodes": slice.nodes,
        "edges": slice.edges,
        // The constellation surface (contract §4): engine-aggregated
        // meta-edges, never client-side flattening (audit G4).
        "meta_edges": slice.meta_edges,
        "filter": slice.filter,
        "truncated": truncated,
    }))
}
