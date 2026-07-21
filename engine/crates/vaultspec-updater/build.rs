//! Emit the exact target triple this updater is compiled for.
//!
//! The copied updater re-verifies the staged release against ITS OWN compiled
//! triple (the distribution authority's closed `DistributionTarget`), never a
//! triple carried in the descriptor. Cargo sets `TARGET` for the build; we
//! surface it as a compile-time env so the crate can parse it into the closed
//! enum with no host-derivation guesswork.

fn main() {
    let target = std::env::var("TARGET").expect("cargo sets TARGET for every build");
    println!("cargo:rustc-env=UPDATER_TARGET={target}");
}
