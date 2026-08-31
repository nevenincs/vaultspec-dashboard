//! The product-tree builder CLI.
//!
//! Invoked with exactly one operand: the path to a build-spec JSON that names the
//! target, the destination generation root, and every pre-built source artifact.
//! The frozen a2a onedir and the component lock that pins it are one OPTIONAL
//! source: supplied, the CLI loads the lock from the spec's own source path and
//! the composed tree carries the runtime; omitted, the tree is composed without
//! one and its manifest omits `a2a_component` outright. The CLI reads the spec,
//! then composes and self-verifies the complete product tree. All authority lives
//! in the library; this shell only parses, dispatches, and classifies into a
//! stable exit code.

use std::path::{Path, PathBuf};

use serde::Deserialize;
use vaultspec_product::manifest::ComponentLock;
use vaultspec_product::product_build::{BuildSources, compose_product_tree};

/// A composed build request: where to place the tree, and the sources to place.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct BuildSpec {
    generation_root: PathBuf,
    sources: BuildSources,
}

/// The tree composed + self-verified.
const EXIT_OK: i32 = 0;
/// Malformed invocation (wrong operand count).
const EXIT_USAGE: i32 = 2;
/// The spec or the component lock was absent or unparseable.
const EXIT_SPEC: i32 = 3;
/// The build failed while composing or self-verifying the product tree.
const EXIT_BUILD: i32 = 4;

fn main() {
    std::process::exit(dispatch(std::env::args_os().skip(1)));
}

fn dispatch(mut operands: impl Iterator<Item = std::ffi::OsString>) -> i32 {
    let Some(spec_path) = operands.next() else {
        eprintln!("vaultspec-product-build: exactly one build-spec path is required");
        return EXIT_USAGE;
    };
    if operands.next().is_some() {
        eprintln!(
            "vaultspec-product-build: unexpected operand; only one build-spec path is accepted"
        );
        return EXIT_USAGE;
    }
    match build(Path::new(&spec_path)) {
        Ok(root) => {
            println!("vaultspec-product-build: composed {}", root.display());
            EXIT_OK
        }
        Err(BuildFailure { code, message }) => {
            eprintln!("vaultspec-product-build: {message}");
            code
        }
    }
}

struct BuildFailure {
    code: i32,
    message: String,
}

fn build(spec_path: &Path) -> Result<PathBuf, BuildFailure> {
    let spec_raw = std::fs::read_to_string(spec_path).map_err(|error| BuildFailure {
        code: EXIT_SPEC,
        message: format!("cannot read build spec: {error}"),
    })?;
    let spec: BuildSpec = serde_json::from_str(&spec_raw).map_err(|error| BuildFailure {
        code: EXIT_SPEC,
        message: format!("build spec is invalid: {error}"),
    })?;

    // The lock is loaded from the spec's own a2a source, so it exists exactly
    // when a bundled runtime does. A spec that declares no runtime names no
    // lock, and the build has no source pin to anchor rather than a missing one.
    let lock = match &spec.sources.a2a {
        Some(a2a) => {
            let lock_raw =
                std::fs::read_to_string(&a2a.component_lock.source).map_err(|error| {
                    BuildFailure {
                        code: EXIT_SPEC,
                        message: format!("cannot read component lock: {error}"),
                    }
                })?;
            Some(
                ComponentLock::parse(&lock_raw).map_err(|error| BuildFailure {
                    code: EXIT_SPEC,
                    message: format!("component lock is invalid: {error}"),
                })?,
            )
        }
        None => None,
    };

    compose_product_tree(&spec.generation_root, &spec.sources, lock.as_ref()).map_err(|error| {
        BuildFailure {
            code: EXIT_BUILD,
            message: error.to_string(),
        }
    })?;
    Ok(spec.generation_root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_operand_is_a_usage_error() {
        assert_eq!(dispatch(std::iter::empty()), EXIT_USAGE);
    }

    #[test]
    fn extra_operands_are_a_usage_error() {
        let operands = vec![
            std::ffi::OsString::from("spec.json"),
            std::ffi::OsString::from("unexpected"),
        ];
        assert_eq!(dispatch(operands.into_iter()), EXIT_USAGE);
    }

    #[test]
    fn an_absent_spec_is_a_spec_error() {
        let operands = vec![std::ffi::OsString::from(
            "/no/such/build/spec/anywhere.json",
        )];
        assert_eq!(dispatch(operands.into_iter()), EXIT_SPEC);
    }
}
