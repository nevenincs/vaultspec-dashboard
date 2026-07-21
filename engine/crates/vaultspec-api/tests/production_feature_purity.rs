//! S11 Stage 1 production-graph contract check.
//!
//! The distribution crate's non-production `unsealed-verify` seam
//! (`verify_distribution_with_unsealed_root`) is enabled ONLY under
//! `vaultspec-product`'s `[dev-dependencies]`, so out-of-crate acceptance tests
//! can obtain a `VerifiedDistributionRelease` from an ephemeral test root while
//! the production entrypoint stays sealed.
//!
//! This inspects the REAL production (normal-edge, no-dev) dependency graph of
//! the shipped front-door crate and fails if the feature ever leaks into it. An
//! in-crate compile-time const assert cannot express this: the gate's
//! `cargo clippy --workspace --all-targets` unifies the dev-only feature across
//! the whole workspace build, so every in-build assert would see it enabled
//! (correctly, for the product test targets). Resolving the normal edges
//! separately is the only faithful proof of the production graph.

#[test]
fn unsealed_verify_seam_is_absent_from_the_production_dependency_graph() {
    let output = std::process::Command::new(env!("CARGO"))
        .args([
            "tree",
            "--manifest-path",
            concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml"),
            "--edges",
            "normal",
            "--format",
            "{p} {f}",
            "--prefix",
            "none",
        ])
        .output()
        .expect("cargo tree must run for the production-graph contract check");
    assert!(
        output.status.success(),
        "cargo tree failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let tree = String::from_utf8_lossy(&output.stdout);
    let leaks: Vec<&str> = tree
        .lines()
        .filter(|line| {
            line.contains("vaultspec-distribution-authority") && line.contains("unsealed-verify")
        })
        .collect();
    assert!(
        leaks.is_empty(),
        "the non-production `unsealed-verify` seam leaked into the vaultspec-api production \
         dependency graph (it must stay enabled only under vaultspec-product's \
         [dev-dependencies]):\n{}",
        leaks.join("\n")
    );
}
