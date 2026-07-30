//! The real-artifact product certifier.
//!
//! This tool proves properties of a PUBLISHED product artifact by opening the
//! archive, staging it exactly as the product-owned installers do, verifying the
//! installed tree through the shipped product authority, and executing the
//! installed commands. It asserts nothing about metadata it has not proven
//! against bytes on disk and processes that actually ran.
//!
//! Three outcomes are possible for every case, and they are kept strictly
//! distinct:
//!
//! - **certified** — the case drove the real artifact and the property held;
//! - **evidence unavailable** — the case could not be driven because the
//!   required real evidence is absent (no archive, no component in the tree, the
//!   host is still networked when the case requires isolation). This is a
//!   FAIL-CLOSED outcome with a typed reason and a non-zero exit; it is never a
//!   pass and never a skip;
//! - **failed** — the case drove the real artifact and the property did not
//!   hold.
//!
//! All product authority lives in `vaultspec_product`; this tool parses,
//! stages, drives, and classifies. It never re-implements a verification the
//! library owns, and it never authorizes a candidate tree with a lock the
//! candidate itself carries — the trusted component lock is embedded at compile
//! time, exactly as the shipped `verify-release` verb embeds it.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// The trusted component lock, compiled in. A candidate tree can never
/// authorize its own lock, so the certifier reads the lock it was built with
/// rather than the copy the artifact carries.
const EMBEDDED_COMPONENT_LOCK: &str =
    include_str!("../../../../../packaging/a2a-component.lock.json");

/// The member manifest a composed product tree carries at its root.
const RELEASE_MANIFEST: &str = "release.json";

/// Every case certified.
const EXIT_OK: i32 = 0;
/// Malformed invocation.
const EXIT_USAGE: i32 = 2;
/// At least one case could not be driven because real evidence is unavailable.
const EXIT_EVIDENCE: i32 = 3;
/// At least one case drove the artifact and the property did not hold.
const EXIT_FAILED: i32 = 4;

/// Captured-output byte cap for one executed installed command.
const COMMAND_OUTPUT_CAP: usize = 1024 * 1024;
/// Wall clock for one executed installed command.
const COMMAND_WALL: Duration = Duration::from_secs(120);
/// Wall clock for the archive extraction, which unpacks a bundled runtime.
const EXTRACT_WALL: Duration = Duration::from_secs(600);
/// Captured-output byte cap for the extraction command.
const EXTRACT_OUTPUT_CAP: usize = 256 * 1024;
/// Hard ceiling on the bytes the certifier will digest from one archive.
const MAX_ARCHIVE_BYTES: u64 = 4 * 1024 * 1024 * 1024;
/// Read-chunk size for the bounded archive digest.
const DIGEST_CHUNK_BYTES: usize = 64 * 1024;
/// Per-endpoint connect budget for the network-isolation probe.
const ISOLATION_PROBE_TIMEOUT: Duration = Duration::from_secs(2);
/// How many real contenders race the installation authority in the
/// single-flight case. Small, fixed, and enough that a broken exclusion shows.
const CONCURRENT_ENSURE_CONTENDERS: usize = 8;
/// Wall clock for the short-lived host probe process.
const PROBE_WALL: Duration = Duration::from_secs(30);
/// The gateway-owned worker IPC credential the dashboard must never create.
const WORKER_IPC_CREDENTIAL: &str = "worker-ipc.cred";
/// Ceilings on the retained-artifact token scan.
const MAX_SCAN_FILES: usize = 100_000;
const MAX_SCAN_DIRECTORIES: usize = 10_000;
const MAX_SCAN_FILE_BYTES: u64 = 64 * 1024 * 1024;

/// Well-known always-on endpoints the isolation probe must fail to reach. A
/// successful connect to any of them proves the host is still networked, so a
/// case that requires isolation reports its evidence unavailable rather than
/// certifying an offline property under a live network.
const ISOLATION_PROBE_ENDPOINTS: [&str; 2] = ["1.1.1.1:443", "8.8.8.8:53"];
/// A public name the isolation probe must fail to resolve.
const ISOLATION_PROBE_NAME: &str = "release.vaultspec.invalid.example.com:443";

fn main() {
    std::process::exit(run(std::env::args().skip(1)));
}

// ---------------------------------------------------------------------------

// The bin's own file is a crate root, so a bare `mod` would resolve as a sibling
// in `src/bin/` — where Cargo would discover each module as another binary. The
// explicit paths keep this tool's modules in its own directory.
#[path = "product_certify/artifact.rs"]
mod artifact;
#[path = "product_certify/cases.rs"]
mod cases;
#[path = "product_certify/command.rs"]
mod command;
#[path = "product_certify/network.rs"]
mod network;

use artifact::Artifact;
use cases::{
    case_clean_install_offline, case_concurrent_ensure_single_flight, case_credential_separation,
    case_relocation, case_runtime_singleton, case_stale_discovery_quarantine, case_token_redaction,
};

// Outcomes
// ---------------------------------------------------------------------------

/// Why a case could not be driven against real evidence. Every variant names
/// the exact missing thing so a certification run is diagnosable without
/// re-running it.
#[derive(Debug)]
enum EvidenceGap {
    /// The named artifact path does not exist.
    ArtifactAbsent { path: String },
    /// The artifact is not one of the published archive shapes.
    ArtifactNotAnArchive { path: String },
    /// The published archive ships a sibling digest; this one does not, so its
    /// integrity cannot be established.
    ArchiveDigestUnavailable { sibling: String },
    /// The extraction tool the product-owned installers use is not on this host.
    ExtractionToolUnavailable { tool: String, detail: String },
    /// The installed tree does not carry a component the case must drive.
    ComponentAbsent {
        component: &'static str,
        relative: String,
    },
    /// The case requires a network-isolated host and this host still has egress.
    NetworkReachable { endpoint: String },
    /// The embedded trust authority itself is unusable, so nothing can be
    /// certified against it.
    TrustAuthorityInvalid { detail: String },
}

impl std::fmt::Display for EvidenceGap {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ArtifactAbsent { path } => {
                write!(f, "no published artifact at {path}")
            }
            Self::ArtifactNotAnArchive { path } => write!(
                f,
                "{path} is not a published archive (.zip, .tar.gz, or .tgz)"
            ),
            Self::ArchiveDigestUnavailable { sibling } => write!(
                f,
                "the published archive's sibling digest {sibling} is absent, so archive integrity cannot be established"
            ),
            Self::ExtractionToolUnavailable { tool, detail } => write!(
                f,
                "the installer's extraction tool {tool} is unavailable on this host: {detail}"
            ),
            Self::ComponentAbsent {
                component,
                relative,
            } => write!(f, "the installed tree carries no {component} at {relative}"),
            Self::NetworkReachable { endpoint } => write!(
                f,
                "this host still reaches {endpoint}; the case requires network access to be removed first"
            ),
            Self::TrustAuthorityInvalid { detail } => {
                write!(
                    f,
                    "the embedded trusted component lock is unusable: {detail}"
                )
            }
        }
    }
}

/// A case that could not be certified: either the evidence was unavailable or
/// the property did not hold. The two are never collapsed.
#[derive(Debug)]
enum CaseError {
    Unavailable(EvidenceGap),
    Failed(String),
}

impl CaseError {
    fn failed(detail: impl Into<String>) -> Self {
        Self::Failed(detail.into())
    }
}

impl From<EvidenceGap> for CaseError {
    fn from(gap: EvidenceGap) -> Self {
        Self::Unavailable(gap)
    }
}

/// A case outcome: `Ok` carries the bounded evidence summary that was proven.
type CaseResult = Result<String, CaseError>;

// ---------------------------------------------------------------------------

// The case roster
// ---------------------------------------------------------------------------

/// One certification case: a stable id, a human title, and the drive function.
struct Case {
    id: &'static str,
    title: &'static str,
    run: fn(&Artifact) -> CaseResult,
}

/// The complete roster. Bounded by construction: a fixed slice, no runtime
/// registration, no dynamic growth.
const CASES: &[Case] = &[
    Case {
        id: "clean-install-offline",
        title: "clean installation from a locally staged artifact with network access removed",
        run: case_clean_install_offline,
    },
    Case {
        id: "relocation",
        title: "relocation preserves onedir resolution, app-home separation, receipt authority, and dashboard launch",
        run: case_relocation,
    },
    Case {
        id: "runtime-singleton",
        title: "the runtime singleton excludes a second gateway before bind or discovery publication",
        run: case_runtime_singleton,
    },
    Case {
        id: "concurrent-ensure-single-flight",
        title: "concurrent ensure operations attach to one job and never spawn a second mutation",
        run: case_concurrent_ensure_single_flight,
    },
    Case {
        id: "credential-separation",
        title: "bootstrap creates and retains distinct ownership and attach-control credentials, and creates no worker credential",
        run: case_credential_separation,
    },
    Case {
        id: "stale-discovery-quarantine",
        title: "only a matching receipt owner may quarantine stale discovery, after proving the recorded process dead",
        run: case_stale_discovery_quarantine,
    },
    Case {
        id: "token-redaction",
        title: "token values never appear in discovery, retained artifacts, diagnostics, or the installed tree",
        run: case_token_redaction,
    },
];

// ---------------------------------------------------------------------------

// Invocation
// ---------------------------------------------------------------------------

/// A parsed invocation.
struct Invocation {
    artifact: PathBuf,
    workspace: PathBuf,
    selected: Vec<&'static Case>,
}

fn run(args: impl Iterator<Item = String>) -> i32 {
    let invocation = match parse(args) {
        Ok(Parsed::Listing) => {
            for case in CASES {
                println!("{}\t{}", case.id, case.title);
            }
            return EXIT_OK;
        }
        Ok(Parsed::Certify(invocation)) => invocation,
        Err(detail) => {
            eprintln!("product-certify: {detail}");
            eprintln!(
                "usage: product_certify --artifact <archive> --workspace <dir> [--case <id>]... | --list"
            );
            return EXIT_USAGE;
        }
    };

    let artifact = match Artifact::open(&invocation) {
        Ok(artifact) => artifact,
        Err(CaseError::Unavailable(gap)) => {
            eprintln!("product-certify: evidence unavailable: {gap}");
            return EXIT_EVIDENCE;
        }
        Err(CaseError::Failed(detail)) => {
            eprintln!("product-certify: artifact failed to stage: {detail}");
            return EXIT_FAILED;
        }
    };

    let mut unavailable = 0usize;
    let mut failed = 0usize;
    for case in &invocation.selected {
        match (case.run)(&artifact) {
            Ok(evidence) => println!("certified\t{}\t{evidence}", case.id),
            Err(CaseError::Unavailable(gap)) => {
                unavailable += 1;
                println!("evidence-unavailable\t{}\t{gap}", case.id);
            }
            Err(CaseError::Failed(detail)) => {
                failed += 1;
                println!("failed\t{}\t{detail}", case.id);
            }
        }
    }

    if failed > 0 {
        eprintln!("product-certify: {failed} case(s) failed");
        return EXIT_FAILED;
    }
    if unavailable > 0 {
        eprintln!(
            "product-certify: {unavailable} case(s) could not be driven against real evidence"
        );
        return EXIT_EVIDENCE;
    }
    EXIT_OK
}

enum Parsed {
    Listing,
    Certify(Invocation),
}

fn parse(mut args: impl Iterator<Item = String>) -> Result<Parsed, String> {
    let mut artifact: Option<PathBuf> = None;
    let mut workspace: Option<PathBuf> = None;
    let mut requested: BTreeSet<String> = BTreeSet::new();
    let mut list = false;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--artifact" => artifact = Some(PathBuf::from(next(&mut args, "--artifact")?)),
            "--workspace" => workspace = Some(PathBuf::from(next(&mut args, "--workspace")?)),
            "--case" => {
                let id = next(&mut args, "--case")?;
                if !CASES.iter().any(|case| case.id == id) {
                    return Err(format!("unknown case `{id}`; --list names every case"));
                }
                requested.insert(id);
            }
            "--list" => list = true,
            other => return Err(format!("unexpected argument `{other}`")),
        }
    }
    if list {
        return Ok(Parsed::Listing);
    }
    let (Some(artifact), Some(workspace)) = (artifact, workspace) else {
        return Err("--artifact and --workspace are required".to_string());
    };
    let selected: Vec<&'static Case> = CASES
        .iter()
        .filter(|case| requested.is_empty() || requested.contains(case.id))
        .collect();
    Ok(Parsed::Certify(Invocation {
        artifact,
        workspace,
        selected,
    }))
}

fn next(args: &mut impl Iterator<Item = String>, flag: &str) -> Result<String, String> {
    args.next().ok_or_else(|| format!("{flag} needs a value"))
}

// ---------------------------------------------------------------------------

// Small shared helpers
// ---------------------------------------------------------------------------

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn describe_code(code: Option<i32>) -> String {
    code.map_or_else(|| "on a signal".to_string(), |code| code.to_string())
}

const fn exe_suffix() -> &'static str {
    if cfg!(windows) { ".exe" } else { "" }
}

#[cfg(test)]
mod tests {
    use vaultspec_product::manifest::ComponentLock;

    use super::*;

    fn strings(args: &[&str]) -> std::vec::IntoIter<String> {
        args.iter()
            .map(|arg| (*arg).to_string())
            .collect::<Vec<_>>()
            .into_iter()
    }

    #[test]
    fn the_embedded_trust_authority_parses() {
        ComponentLock::parse(EMBEDDED_COMPONENT_LOCK)
            .expect("the certifier's embedded trusted lock must parse");
    }

    #[test]
    fn missing_required_flags_is_a_usage_error() {
        assert_eq!(run(strings(&[])), EXIT_USAGE);
    }

    #[test]
    fn an_unknown_case_is_a_usage_error() {
        assert_eq!(
            run(strings(&[
                "--artifact",
                "a.zip",
                "--workspace",
                "w",
                "--case",
                "no-such-case",
            ])),
            EXIT_USAGE
        );
    }

    #[test]
    fn listing_the_roster_succeeds() {
        assert_eq!(run(strings(&["--list"])), EXIT_OK);
    }

    #[test]
    fn every_case_id_is_unique() {
        let unique: BTreeSet<&str> = CASES.iter().map(|case| case.id).collect();
        assert_eq!(unique.len(), CASES.len(), "case ids must be unique");
    }

    /// An absent artifact is EVIDENCE UNAVAILABLE, never a pass: the certifier
    /// fails closed with the typed reason and its own exit code.
    #[test]
    fn an_absent_artifact_is_evidence_unavailable() {
        let temp = tempfile::tempdir().unwrap();
        let workspace = temp.path().join("workspace");
        assert_eq!(
            run(strings(&[
                "--artifact",
                "/no/such/published/artifact.tar.gz",
                "--workspace",
                &workspace.to_string_lossy(),
            ])),
            EXIT_EVIDENCE
        );
    }

    /// A file that is not a published archive shape is likewise fail-closed.
    #[test]
    fn a_non_archive_is_evidence_unavailable() {
        let temp = tempfile::tempdir().unwrap();
        let artifact = temp.path().join("not-an-archive.bin");
        std::fs::write(&artifact, b"not a published archive").unwrap();
        assert_eq!(
            run(strings(&[
                "--artifact",
                &artifact.to_string_lossy(),
                "--workspace",
                &temp.path().join("workspace").to_string_lossy(),
            ])),
            EXIT_EVIDENCE
        );
    }

    /// A published archive always ships a sibling digest. One without it cannot
    /// have its integrity established, so it is fail-closed rather than staged.
    #[test]
    fn an_archive_without_its_sibling_digest_is_evidence_unavailable() {
        let temp = tempfile::tempdir().unwrap();
        let artifact = temp.path().join("vaultspec-0.0.0-test.tar.gz");
        std::fs::write(&artifact, b"\x1f\x8b\x08\x00").unwrap();
        assert_eq!(
            run(strings(&[
                "--artifact",
                &artifact.to_string_lossy(),
                "--workspace",
                &temp.path().join("workspace").to_string_lossy(),
            ])),
            EXIT_EVIDENCE
        );
    }

    /// A sibling digest that disagrees with the archive bytes is a real
    /// certification FAILURE, distinct from unavailable evidence.
    #[test]
    fn a_mismatched_sibling_digest_fails_certification() {
        let temp = tempfile::tempdir().unwrap();
        let artifact = temp.path().join("vaultspec-0.0.0-test.tar.gz");
        std::fs::write(&artifact, b"\x1f\x8b\x08\x00").unwrap();
        std::fs::write(
            temp.path().join("vaultspec-0.0.0-test.tar.gz.sha256"),
            format!("{}  archive\n", "0".repeat(64)),
        )
        .unwrap();
        assert_eq!(
            run(strings(&[
                "--artifact",
                &artifact.to_string_lossy(),
                "--workspace",
                &temp.path().join("workspace").to_string_lossy(),
            ])),
            EXIT_FAILED
        );
    }
}
