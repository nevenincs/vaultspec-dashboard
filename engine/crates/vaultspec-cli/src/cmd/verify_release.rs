//! `vaultspec verify-release <root>` — the product-owned installer's placement
//! integrity check (a2a-product-provisioning W04.P09).
//!
//! The product-owned installers (`packaging/install.sh` / `install.ps1`, the MSI)
//! shell out to this shipped verb after placing the product tree, so every
//! channel verifies the SAME bounded Rust authority rather than restating trusted
//! digests in shell. It proves the installed tree matches its own `release.json`
//! through `vaultspec_product::product_build::verify_installed_tree`: the S06
//! manifest verifier plus the shared file-coverage check the build-time composer
//! uses, so a build that composed and an install that verifies agree by
//! construction. This is placement INTEGRITY (the download/copy was not corrupted
//! or tampered); the deeper TUF and receipt trust is established at build and at
//! runtime first-run provisioning, not here.
//!
//! The trusted component lock is EMBEDDED at compile time (the committed
//! `packaging/a2a-component.lock.json`), never read from the candidate tree — a
//! candidate cannot authorize its own lock.

use std::path::Path;

use serde_json::{Value, json};
use vaultspec_product::manifest::ComponentLock;
use vaultspec_product::product_build::verify_installed_tree;

/// The trusted component lock, compiled into the shipped binary. This is the
/// "bounded Rust authority" the installers verify against.
const EMBEDDED_COMPONENT_LOCK: &str =
    include_str!("../../../../../packaging/a2a-component.lock.json");

/// The manifest a composed product tree carries at its root.
const RELEASE_MANIFEST: &str = "release.json";

/// Verify the installed product tree at `root` matches its own `release.json`
/// under the embedded trusted lock. Returns a served-shaped result on success or
/// a bounded diagnostic string on failure.
pub fn run(root: &Path) -> Result<Value, String> {
    let lock = ComponentLock::parse(EMBEDDED_COMPONENT_LOCK)
        .map_err(|error| format!("embedded component lock is invalid: {error}"))?;
    verify_installed_tree(root, RELEASE_MANIFEST, &lock)
        .map_err(|error| format!("installed tree verification failed: {error}"))?;
    Ok(json!({
        "verified": true,
        "root": root.to_string_lossy(),
        "manifest": RELEASE_MANIFEST,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_embedded_component_lock_parses() {
        // The compiled-in trusted lock is the verify authority; it must be a valid
        // lock so the verb never fails for its OWN authority being malformed.
        ComponentLock::parse(EMBEDDED_COMPONENT_LOCK).expect("embedded lock parses");
    }

    #[test]
    fn an_absent_release_manifest_is_a_failure() {
        let temp = tempfile::tempdir().unwrap();
        // A tree with no release.json cannot be verified — the installer surfaces
        // this as a failed placement.
        let refused = run(temp.path());
        assert!(
            refused.is_err(),
            "a tree without release.json must fail verification"
        );
    }
}
