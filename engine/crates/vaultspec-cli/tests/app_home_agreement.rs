//! The two machine-app-home resolvers must agree.
//!
//! `vaultspec_session::app_home_dir` and `vaultspec_product::paths::ProductPaths::derive`
//! each resolve the machine app home independently — `VAULTSPEC_APP_HOME`, else
//! `USERPROFILE`/`HOME` joined with `.vaultspec`. The duplication is deliberate:
//! the two crates are siblings with no shared low-level dependency, and neither
//! direction of dependency is acceptable (`vaultspec-session` carries bundled
//! SQLite; `vaultspec-product` carries the distribution authority). Extracting a
//! shared helper was refused because "resolve a home directory" already means
//! two different things in this workspace — the ENGINE app home resolved here,
//! and the OPERATOR home the folder picker wants
//! (`vaultspec-api/src/routes/fs_browse.rs`, deliberately one segment short of
//! the `.vaultspec` join). A shared utility would invite the picker to be routed
//! through it "for consistency" and silently start opening at `~/.vaultspec`.
//!
//! So drift is made DETECTABLE here rather than impossible by construction.
//! `vaultspec-cli` already depends on both crates, so this test costs no
//! crate-graph change.
//!
//! REVISIT THE SHARED-CRATE DECISION IF: the resolution grows branching beyond
//! the current flat precedence (XDG handling, legacy-home migration, per-platform
//! divergence), or a THIRD implementation appears. Flat precedence duplicated
//! twice is fine; branching logic duplicated twice is not.

use vaultspec_product::paths::{PathError, ProductPaths};

/// Both resolvers, run against whatever home variables this process already has.
///
/// Deliberately mutates no environment: `set_var` is `unsafe` under edition 2024
/// and process-global under a parallel test runner, so an env-mutating form
/// would be racy. Running against the ambient environment exercises the fallback
/// precedence chain — the branch most likely to be edited — and is inherently
/// race-free. The `VAULTSPEC_APP_HOME` override branch is covered only when the
/// ambient environment happens to set it (as the seat-matrix harness does for
/// its children); covering it unconditionally would need a serialized env guard,
/// which is not worth the contention here.
#[test]
fn the_two_app_home_resolvers_agree() {
    match vaultspec_session::app_home_dir() {
        Some(home) => {
            let derived = ProductPaths::derive()
                .expect("product path derivation must succeed wherever the session resolver does");
            assert_eq!(
                derived.root(),
                ProductPaths::under_app_home(&home).root(),
                "the session and product app-home resolvers disagree; they duplicate one \
                 precedence chain (VAULTSPEC_APP_HOME, else USERPROFILE/HOME + .vaultspec) \
                 and one of them has drifted"
            );
        }
        None => {
            assert!(
                matches!(ProductPaths::derive(), Err(PathError::NoAppHome)),
                "the session resolver found no app home, so the product resolver must \
                 refuse with NoAppHome rather than resolve one"
            );
        }
    }
}
