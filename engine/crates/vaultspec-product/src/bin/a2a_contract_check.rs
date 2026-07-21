//! Bounded producer-consumer check for one detached A2A capsule manifest.
//!
//! This executable is diagnostic release tooling, not installation authority.
//! It admits only the component lock committed into this build, one detached
//! manifest, and one member of the product's closed target enum. It neither
//! opens nor materializes a capsule archive.

use std::ffi::OsStr;
use std::fs::File;
use std::io::Read as _;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use vaultspec_product::manifest::{CapsuleManifest, ComponentLock, Target};

const COMMITTED_COMPONENT_LOCK: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packaging/a2a-component.lock.json"
));
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_PATH_UNITS: usize = 4_096;
const MAX_TARGET_BYTES: usize = 64;
const MAX_DIAGNOSTIC_CHARS: usize = 512;

fn main() -> ExitCode {
    match check(std::env::args_os().skip(1)) {
        Ok(target) => {
            println!(
                "PASS detached-manifest-only target={}; archive=UNVERIFIED activation=UNAUTHORIZED",
                target.triple()
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("REFUSED stage={} detail={}", error.stage, error.detail);
            ExitCode::from(2)
        }
    }
}

fn check(mut arguments: impl Iterator<Item = std::ffi::OsString>) -> Result<Target, CheckError> {
    let component_lock_path = arguments
        .next()
        .ok_or_else(|| CheckError::invocation("missing committed component-lock path"))?;
    let capsule_manifest_path = arguments
        .next()
        .ok_or_else(|| CheckError::invocation("missing detached capsule-manifest path"))?;
    let target = arguments
        .next()
        .ok_or_else(|| CheckError::invocation("missing closed product target"))?;
    if arguments.next().is_some() {
        return Err(CheckError::invocation(
            "expected exactly: <component-lock> <capsule-manifest> <target>",
        ));
    }

    let component_lock_path = bounded_path("component-lock", &component_lock_path)?;
    let capsule_manifest_path = bounded_path("capsule-manifest", &capsule_manifest_path)?;
    let target = closed_target(target)?;

    let component_lock_bytes =
        read_bounded_regular_file("component-lock-input", &component_lock_path, MAX_FILE_BYTES)?;
    if component_lock_bytes != COMMITTED_COMPONENT_LOCK {
        return Err(CheckError::new(
            "component-lock-authority",
            "bytes do not equal the component lock committed into this checker",
        ));
    }
    let component_lock_text = String::from_utf8(component_lock_bytes)
        .map_err(|_| CheckError::new("component-lock-input", "committed lock is not UTF-8"))?;
    let component_lock = ComponentLock::parse(&component_lock_text)
        .map_err(|error| CheckError::from_display("component-lock-contract", error))?;

    let capsule_manifest_bytes = read_bounded_regular_file(
        "capsule-manifest-input",
        &capsule_manifest_path,
        MAX_FILE_BYTES,
    )?;
    let capsule_manifest_text = String::from_utf8(capsule_manifest_bytes)
        .map_err(|_| CheckError::new("capsule-manifest-input", "detached manifest is not UTF-8"))?;
    CapsuleManifest::parse_and_verify(&capsule_manifest_text, &component_lock, target)
        .map_err(|error| CheckError::from_display("capsule-contract", error))?;

    Ok(target)
}

fn bounded_path(field: &'static str, raw: &OsStr) -> Result<PathBuf, CheckError> {
    if raw.is_empty() || operand_units(raw) > MAX_PATH_UNITS {
        return Err(CheckError::new(field, "path operand is empty or too long"));
    }
    Ok(PathBuf::from(raw))
}

fn closed_target(raw: std::ffi::OsString) -> Result<Target, CheckError> {
    let raw = raw
        .into_string()
        .map_err(|_| CheckError::new("target", "target must be a UTF-8 product target triple"))?;
    if raw.is_empty() || raw.len() > MAX_TARGET_BYTES {
        return Err(CheckError::new(
            "target",
            "target operand is empty or too long",
        ));
    }
    serde_json::from_value(serde_json::Value::String(raw)).map_err(|_| {
        CheckError::new(
            "target",
            "target is not one of the five closed product triples",
        )
    })
}

fn read_bounded_regular_file(
    stage: &'static str,
    path: &Path,
    limit: u64,
) -> Result<Vec<u8>, CheckError> {
    #[cfg(unix)]
    let file = {
        use std::os::unix::fs::OpenOptionsExt as _;

        let mut options = std::fs::OpenOptions::new();
        options
            .read(true)
            .custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_CLOEXEC | nix::libc::O_NONBLOCK);
        options
            .open(path)
            .map_err(|_| CheckError::new(stage, "input cannot be opened no-follow"))?
    };

    #[cfg(windows)]
    let authority = vaultspec_windows_authority::AuthorityFile::open_reader(path)
        .map_err(|_| CheckError::new(stage, "input cannot be opened no-follow"))?;

    #[cfg(unix)]
    let file = &file;
    #[cfg(windows)]
    let file = authority.file();

    read_bounded_handle(stage, file, limit)
}

fn read_bounded_handle(
    stage: &'static str,
    file: &File,
    limit: u64,
) -> Result<Vec<u8>, CheckError> {
    let opened = file
        .metadata()
        .map_err(|_| CheckError::new(stage, "opened input metadata is unavailable"))?;
    if !opened.is_file() {
        return Err(CheckError::new(stage, "opened input is not a regular file"));
    }
    if opened.len() > limit {
        return Err(CheckError::new(stage, "input exceeds the fixed byte bound"));
    }

    let mut bytes = Vec::with_capacity(usize::try_from(opened.len()).unwrap_or(0));
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| CheckError::new(stage, "bounded input read failed"))?;
    if bytes.len() as u64 > limit {
        return Err(CheckError::new(stage, "input exceeds the fixed byte bound"));
    }
    Ok(bytes)
}

#[cfg(unix)]
fn operand_units(value: &OsStr) -> usize {
    use std::os::unix::ffi::OsStrExt as _;
    value.as_bytes().len()
}

#[cfg(windows)]
fn operand_units(value: &OsStr) -> usize {
    use std::os::windows::ffi::OsStrExt as _;
    value.encode_wide().count()
}

struct CheckError {
    stage: &'static str,
    detail: String,
}

impl CheckError {
    fn invocation(detail: &'static str) -> Self {
        Self::new("invocation", detail)
    }

    fn new(stage: &'static str, detail: &str) -> Self {
        Self {
            stage,
            detail: bounded_diagnostic(detail),
        }
    }

    fn from_display(stage: &'static str, error: impl std::fmt::Display) -> Self {
        Self::new(stage, &error.to_string())
    }
}

fn bounded_diagnostic(detail: &str) -> String {
    detail
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .take(MAX_DIAGNOSTIC_CHARS)
        .collect()
}
