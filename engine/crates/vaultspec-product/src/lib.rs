//! Shared product-contract boundary for dashboard-owned A2A provisioning.
//!
//! This crate is the reusable authority the dashboard API, CLI, external
//! updater, and release tools consume to install, own, update, repair, roll
//! back, and remove the adjacent A2A capsule as one composite release set
//! (a2a-product-provisioning ADR). It exposes only stable product-contract,
//! lifecycle, and build-tool modules — never A2A-internal Python detail, which
//! stays opaque behind the capsule manifest.
//!
//! Modules delivered so far (W01.P01):
//!
//! - [`manifest`] — parse and fail-closed verification of the component lock,
//!   the A2A-emitted capsule manifest, and the dashboard release-set manifest.
//! - [`paths`] — product-owned install/generation/app-home/transaction/
//!   staging/snapshot/updater path authority, derived from product state.
//! - [`receipt`] — the atomic complete release-set receipt.
//! - [`credentials`] — the dashboard/gateway/worker credential separation.
//! - [`locking`] — the installation transaction lock and stale-state quarantine.
//!
//! Later steps add the lifecycle protocol, discovery/control/process ownership,
//! transactional update, and build/certify tools behind this same boundary.

pub mod credentials;
pub mod locking;
pub mod manifest;
pub mod paths;
pub mod receipt;
