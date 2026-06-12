//! `vaultspec graph [--filter …] [--as-of …]` — export the linkage graph
//! as tier-labelled node-link JSON through the shared query core.

use engine_query::filter::Filter;
use engine_query::graph::{Granularity, graph_query};
use serde_json::{Value, json};

use super::{CliError, Ctx};

pub fn run(ctx: &Ctx, filter_json: Option<&str>, as_of: Option<&str>) -> Result<Value, CliError> {
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
            let graph = engine_graph::asof::asof_graph(&ctx.root, reference, &scope, 0)?;
            (graph, scope)
        }
        None => {
            let (graph, _stats) = ctx.indexed_graph()?;
            (graph, ctx.scope.clone())
        }
    };

    let slice = graph_query(&graph, &scope, filter, Granularity::Document)?;
    Ok(json!({
        "as_of": as_of,
        "nodes": slice.nodes,
        "edges": slice.edges,
        "filter": slice.filter,
    }))
}
