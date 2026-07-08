//! The single shared query core (engine-spec D6.1).
//!
//! CLI verbs and serve endpoints are thin shells over this crate; no
//! capability exists in only one front door. Scope is fully stateless:
//! every working-tree-dependent query names its scope per request
//! (contract §3).

pub mod code;
pub mod embeddings;
pub mod envelope;
pub mod events;
pub mod filter;
pub mod graph;
pub mod lineage;
pub mod node;
pub mod ontology;
pub mod pipeline;
pub mod salience;
