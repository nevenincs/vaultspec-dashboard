//! Route families (contract §3–§8).

pub mod ops;
pub mod query;
pub mod spa;
pub mod stream;
pub mod temporal;

use crate::app::AppState;

/// The present-view tier block as JSON (rag truthfully stated).
pub(crate) fn query_tiers(state: &AppState) -> serde_json::Value {
    let block = match rag_client::client::discover(&state.root.join(".vault")).0 {
        rag_client::RagAvailability::Available => engine_query::envelope::tiers_block(&[]),
        rag_client::RagAvailability::Unavailable { reason } => {
            engine_query::envelope::tiers_block(&[("semantic", reason.as_str())])
        }
    };
    serde_json::to_value(block).expect("tiers serialize")
}
