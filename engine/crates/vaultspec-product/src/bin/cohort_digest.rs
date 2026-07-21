//! The cohort-digest CLI (a2a-product-provisioning W04.P08.S166): aggregate the
//! five verified member manifests into the external cohort descriptor and emit its
//! RFC 8785 JCS preimage + digest.
//!
//! Invoked by the product-release workflow after the five per-target member
//! manifests exist. All authority lives in the library
//! (`vaultspec_product::cohort`); this shell parses, dispatches, and classifies.
//!
//! Usage:
//!   cohort_digest --lock <component-lock.json> \
//!     --member <target>=<member-manifest.json> (x5) \
//!     --out <cohort-descriptor.json>
//!
//! Prints the cohort digest (SHA-256 of the JCS descriptor bytes) to stdout and
//! writes the JCS descriptor to `--out`. Exit codes: 0 ok, 2 usage, 3 input, 4
//! aggregation failure.

use std::path::PathBuf;

use vaultspec_product::cohort::emit_cohort_descriptor;
use vaultspec_product::manifest::{ComponentLock, Target};

const EXIT_OK: i32 = 0;
const EXIT_USAGE: i32 = 2;
const EXIT_INPUT: i32 = 3;
const EXIT_AGGREGATE: i32 = 4;

fn main() {
    std::process::exit(run(std::env::args().skip(1)));
}

fn run(mut args: impl Iterator<Item = String>) -> i32 {
    let mut lock_path: Option<PathBuf> = None;
    let mut out_path: Option<PathBuf> = None;
    let mut members: Vec<(Target, PathBuf)> = Vec::new();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--lock" => match args.next() {
                Some(value) => lock_path = Some(PathBuf::from(value)),
                None => return usage("--lock needs a path"),
            },
            "--out" => match args.next() {
                Some(value) => out_path = Some(PathBuf::from(value)),
                None => return usage("--out needs a path"),
            },
            "--member" => match args.next() {
                Some(value) => match value.split_once('=') {
                    Some((target, path)) => match parse_target(target) {
                        Some(target) => members.push((target, PathBuf::from(path))),
                        None => return usage(&format!("unknown target `{target}`")),
                    },
                    None => return usage("--member expects <target>=<path>"),
                },
                None => return usage("--member needs <target>=<path>"),
            },
            other => return usage(&format!("unexpected argument `{other}`")),
        }
    }

    let (Some(lock_path), Some(out_path)) = (lock_path, out_path) else {
        return usage("--lock and --out are required");
    };

    let lock_raw = match std::fs::read_to_string(&lock_path) {
        Ok(raw) => raw,
        Err(error) => return input(&format!("cannot read lock: {error}")),
    };
    let lock = match ComponentLock::parse(&lock_raw) {
        Ok(lock) => lock,
        Err(error) => return input(&format!("component lock is invalid: {error}")),
    };

    let mut raw_members = Vec::with_capacity(members.len());
    for (target, path) in members {
        match std::fs::read_to_string(&path) {
            Ok(raw) => raw_members.push((target, raw)),
            Err(error) => {
                return input(&format!("cannot read member {}: {error}", target.triple()));
            }
        }
    }

    match emit_cohort_descriptor(&raw_members, &lock) {
        Ok(emission) => {
            if let Err(error) = std::fs::write(&out_path, &emission.descriptor_jcs) {
                eprintln!("cohort-digest: cannot write descriptor: {error}");
                return EXIT_INPUT;
            }
            println!("{}", emission.cohort_digest);
            EXIT_OK
        }
        Err(error) => {
            eprintln!("cohort-digest: {error}");
            EXIT_AGGREGATE
        }
    }
}

/// Parse a target triple into the closed [`Target`] enum via its serde renaming.
fn parse_target(triple: &str) -> Option<Target> {
    serde_json::from_value(serde_json::Value::String(triple.to_string())).ok()
}

fn usage(detail: &str) -> i32 {
    eprintln!("cohort-digest: {detail}");
    EXIT_USAGE
}

fn input(detail: &str) -> i32 {
    eprintln!("cohort-digest: {detail}");
    EXIT_INPUT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_required_flags_is_a_usage_error() {
        assert_eq!(run(std::iter::empty()), EXIT_USAGE);
    }

    #[test]
    fn an_unknown_target_is_a_usage_error() {
        let args = vec![
            "--lock".to_string(),
            "lock.json".to_string(),
            "--out".to_string(),
            "out.json".to_string(),
            "--member".to_string(),
            "not-a-target=m.json".to_string(),
        ];
        assert_eq!(run(args.into_iter()), EXIT_USAGE);
    }

    #[test]
    fn an_absent_lock_is_an_input_error() {
        let args = vec![
            "--lock".to_string(),
            "/no/such/lock.json".to_string(),
            "--out".to_string(),
            "out.json".to_string(),
        ];
        assert_eq!(run(args.into_iter()), EXIT_INPUT);
    }
}
