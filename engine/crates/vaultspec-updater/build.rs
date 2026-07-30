//! Emit the exact target triple this updater is compiled for, and embed the
//! Windows `asInvoker` application manifest.
//!
//! The copied updater re-verifies the staged release against ITS OWN compiled
//! triple (the distribution authority's closed `DistributionTarget`), never a
//! triple carried in the descriptor. Cargo sets `TARGET` for the build; we
//! surface it as a compile-time env so the crate can parse it into the closed
//! enum with no host-derivation guesswork.
//!
//! On Windows the executables of this package MUST carry an explicit
//! `asInvoker` manifest: Windows installer detection escalates any
//! un-manifested executable whose name looks like an installer — and every
//! target here is named `vaultspec-updater` — so a detached launch would fail
//! with `ERROR_ELEVATION_REQUIRED` rather than run. The manifest covers the
//! shipped binary and the test executables alike.

fn main() {
    let target = std::env::var("TARGET").expect("cargo sets TARGET for every build");
    println!("cargo:rustc-env=UPDATER_TARGET={target}");

    if target.ends_with("windows-msvc") {
        let manifest = std::path::Path::new(
            &std::env::var("CARGO_MANIFEST_DIR").expect("cargo sets CARGO_MANIFEST_DIR"),
        )
        .join("vaultspec-updater.manifest");
        println!("cargo:rerun-if-changed={}", manifest.display());
        // The manifest supplies the trust info itself, so the linker must not
        // also synthesize one (`/MANIFESTUAC:NO`) — two would conflict.
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFESTUAC:NO");
    }
}
