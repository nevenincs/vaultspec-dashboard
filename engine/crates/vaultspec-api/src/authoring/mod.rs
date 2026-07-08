//! Fenced authoring backend domain.
//!
//! The public authoring API is the collaborator-facing surface for human and
//! agent proposal workflows. It is intentionally separate from `/ops/core/*`:
//! core remains a private validation/materialization adapter added in later
//! waves, and this module does not write vault documents.

pub(crate) mod actor_tokens;
pub(crate) mod actors;
pub(crate) mod api;
pub(crate) mod apply;
pub(crate) mod approvals;
pub(crate) mod core_adapter;
pub(crate) mod direct_write;
pub(crate) mod documents;
pub(crate) mod events;
pub(crate) mod http;
pub(crate) mod interrupts;
pub(crate) mod langgraph;
pub(crate) mod ledger;
pub(crate) mod model;
pub(crate) mod modes;
pub(crate) mod operations;
pub(crate) mod permissions;
pub(crate) mod policy;
pub(crate) mod principal;
pub(crate) mod projections;
pub(crate) mod proposal;
pub(crate) mod response;
pub(crate) mod rollback;
pub(crate) mod routes;
pub(crate) mod session;
pub(crate) mod snapshots;
pub(crate) mod store;
pub(crate) mod stream;
pub(crate) mod tools;
pub(crate) mod transitions;
pub(crate) mod validation;

pub(crate) const FEATURE_TAG: &str = "agentic-spec-authoring-backend";
pub(crate) const ROUTE_FAMILY: &str = "/authoring";
