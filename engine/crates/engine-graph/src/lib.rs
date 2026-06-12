//! The in-memory linkage graph (engine-spec §8): nodes, edges, facets,
//! context assembly, and query-time projections.
//!
//! Vault corpora are thousands of documents, not millions — the graph fits
//! in RAM; the expensive part is ingestion, not storage. Derived
//! projections (per-tier degree counts, lifecycle/progress summaries,
//! meta-edges) are computed at query time, never stored on nodes
//! (engine-spec §4.3).

pub mod context;
pub mod edges;
pub mod facets;
pub mod graph;
pub mod project;

pub use context::{ContextBundle, context};
pub use edges::{EdgeError, ingest, validate};
pub use facets::{Divergence, DivergenceKind, divergences};
pub use graph::{EdgeAttrs, LinkageGraph, StoredEdge};
pub use project::{MetaEdge, degree_by_tier, lifecycle_in_scope, meta_edges};
