//! Embed the Windows application resources used by the product tools.
//!
//! Windows installer detection escalates any un-manifested executable whose
//! name looks like an installer. This crate builds test executables named
//! `update_transaction` and `product_build`, so on Windows they are refused a
//! launch with `ERROR_ELEVATION_REQUIRED` and never execute — the suite reports
//! a harness error, not a test failure, which is easy to mistake for a pass
//! because the passed-count stays clean.
//!
//! Nothing here is an installer: the transaction work replaces files the
//! invoking user already owns under the user-scoped app home, so these must run
//! as the invoking user and never elevated.

#[path = "../../build/windows_resources.rs"]
mod windows_resources;

fn main() {
    windows_resources::embed_application_resources(Some("vaultspec-product.manifest"));
}
