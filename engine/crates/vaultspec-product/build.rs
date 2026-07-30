//! Embed the Windows `asInvoker` application manifest.
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

fn main() {
    let target = std::env::var("TARGET").expect("cargo sets TARGET for every build");
    if !target.ends_with("windows-msvc") {
        return;
    }
    let manifest = std::path::Path::new(
        &std::env::var("CARGO_MANIFEST_DIR").expect("cargo sets CARGO_MANIFEST_DIR"),
    )
    .join("vaultspec-product.manifest");
    println!("cargo:rerun-if-changed={}", manifest.display());
    // The manifest supplies the trust info itself, so the linker must not also
    // synthesize one (`/MANIFESTUAC:NO`) — two would conflict.
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFESTUAC:NO");
}
