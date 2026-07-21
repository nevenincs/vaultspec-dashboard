//! Shared product-contract boundary for dashboard-owned A2A provisioning.
//!
//! This crate is the reusable authority the dashboard API, CLI, external
//! updater, and release tools consume to install, own, update, repair, roll
//! back, and remove the adjacent A2A capsule as one composite release set
//! (a2a-product-provisioning ADR). It exposes only stable product-contract,
//! lifecycle, and build-tool modules — never A2A-internal Python detail, which
//! stays opaque behind the capsule manifest.
//!
//! Modules delivered so far:
//!
//! W01.P01 — product authority substrate:
//! - [`manifest`] — parse and fail-closed verification of the component lock,
//!   the A2A-emitted capsule manifest, and the dashboard release-set manifest.
//! - [`paths`] — product-owned install/generation/app-home/transaction/
//!   staging/snapshot/updater path authority, derived from product state.
//! - [`receipt`] — the atomic complete release-set receipt.
//! - [`credentials`] — the dashboard/gateway/worker credential separation.
//! - [`locking`] — the installation transaction lock and stale-state quarantine.
//!
//! W01.P02 — control only the owned gateway:
//! - [`protocol`] — the typed lifecycle operation, readiness, and refusal
//!   contracts.
//! - [`discovery`] — secret-free versioned discovery validation and the
//!   attach/ownership classification.
//! - [`control`] — the bounded, authenticated loopback control broker.
//! - [`process`] — the owned gateway process tree with bounded cleanup.
//! - [`lifecycle`] — receipt-gated transitions and the standalone-MCP fence.
//!
//! Later steps add transactional update and build/certify tools behind this same
//! boundary.

pub mod bootstrap;
pub mod channels;
pub mod control;
pub mod credentials;
pub mod discovery;
pub mod gateway_drain;
pub mod generation;
pub mod handoff;
pub mod lifecycle;
pub mod locking;
pub mod manifest;
pub mod materializer;
pub mod migration;
pub mod paths;
pub mod process;
pub mod protocol;
pub mod provisioning;
pub mod receipt;
pub mod recovery;
pub mod snapshot;
pub mod transaction;
