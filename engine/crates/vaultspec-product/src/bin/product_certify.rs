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
use std::ffi::OsString;
use std::io::Read;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use vaultspec_product::credentials::DashboardCredentialStore;
use vaultspec_product::gateway_drain::DISCOVERY_FILE;
use vaultspec_product::locking::{
    Actor, InstallLock, LockBusy, LockError, QuarantineRefusal, StaleState,
    quarantine_owner_matched_stale,
};
use vaultspec_product::manifest::ComponentLock;
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::product_build::verify_installed_tree;

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
// The staged artifact
// ---------------------------------------------------------------------------

/// A published archive, opened and staged into the workspace exactly as the
/// product-owned installers stage it: digest-checked, extracted, and available
/// as an installed tree whose commands can be executed.
struct Artifact {
    /// The scratch root every case works under.
    workspace: PathBuf,
    /// The installed product tree extracted from the published archive.
    tree_root: PathBuf,
    /// The trusted component lock every verification is proven against.
    lock: ComponentLock,
    /// The sha256 of the published archive, proven against its sibling digest.
    archive_digest: String,
}

impl Artifact {
    fn open(invocation: &Invocation) -> Result<Self, CaseError> {
        let lock = ComponentLock::parse(EMBEDDED_COMPONENT_LOCK).map_err(|error| {
            CaseError::Unavailable(EvidenceGap::TrustAuthorityInvalid {
                detail: error.to_string(),
            })
        })?;

        let artifact = &invocation.artifact;
        if !artifact.is_file() {
            return Err(EvidenceGap::ArtifactAbsent {
                path: display(artifact),
            }
            .into());
        }
        let shape =
            ArchiveShape::of(artifact).ok_or_else(|| EvidenceGap::ArtifactNotAnArchive {
                path: display(artifact),
            })?;

        let archive_digest = prove_archive_digest(artifact)?;

        let workspace = &invocation.workspace;
        std::fs::create_dir_all(workspace)
            .map_err(|error| CaseError::failed(format!("cannot create the workspace: {error}")))?;
        let tree_root = workspace.join("installed");
        if tree_root.exists() {
            std::fs::remove_dir_all(&tree_root).map_err(|error| {
                CaseError::failed(format!("cannot clear the staging root: {error}"))
            })?;
        }
        std::fs::create_dir_all(&tree_root).map_err(|error| {
            CaseError::failed(format!("cannot create the staging root: {error}"))
        })?;

        shape.extract(artifact, &tree_root)?;

        Ok(Self {
            workspace: workspace.clone(),
            tree_root,
            lock,
            archive_digest,
        })
    }

    /// The installed dashboard executable, or a typed gap naming its absence.
    fn dashboard(&self) -> Result<PathBuf, EvidenceGap> {
        self.installed(
            "dashboard executable",
            &format!("bin/vaultspec{}", exe_suffix()),
        )
    }

    /// The installed frozen A2A runtime executable, or a typed gap.
    fn a2a_runtime(&self) -> Result<PathBuf, EvidenceGap> {
        self.installed(
            "frozen A2A runtime",
            &format!("a2a/vaultspec-a2a{}", exe_suffix()),
        )
    }

    fn installed(&self, component: &'static str, relative: &str) -> Result<PathBuf, EvidenceGap> {
        let path = self.tree_root.join(relative);
        if path.is_file() {
            Ok(path)
        } else {
            Err(EvidenceGap::ComponentAbsent {
                component,
                relative: relative.to_string(),
            })
        }
    }

    /// Bind a case to the real published artifact before it drives anything.
    ///
    /// A runtime case reasons about the installation the artifact establishes,
    /// so it must not certify a property against product state alone: without
    /// the real installed components there is no installation to certify, and
    /// the case reports its evidence unavailable instead.
    fn bind_to_real_components(&self) -> Result<(), CaseError> {
        self.dashboard()?;
        self.a2a_runtime()?;
        Ok(())
    }

    /// The product state authority for this installation, rooted at a machine
    /// app home that is deliberately OUTSIDE the installed tree. Every runtime
    /// case drives the installation's own authority here.
    fn product_paths(&self) -> Result<ProductPaths, CaseError> {
        let paths = ProductPaths::under_app_home(&self.workspace.join("app-home"));
        paths.ensure().map_err(|error| {
            CaseError::failed(format!("cannot establish the product app home: {error}"))
        })?;
        Ok(paths)
    }

    /// Prove the tree at `root` matches its own member manifest through the
    /// shipped product authority under the embedded trusted lock.
    fn prove_tree(&self, root: &Path) -> Result<(), CaseError> {
        verify_installed_tree(root, RELEASE_MANIFEST, &self.lock).map_err(|error| {
            CaseError::failed(format!(
                "installed tree at {} does not match its own {RELEASE_MANIFEST}: {error}",
                display(root)
            ))
        })
    }
}

/// The published archive shapes and the extraction each product-owned installer
/// performs for them.
#[derive(Debug, Clone, Copy)]
enum ArchiveShape {
    Zip,
    TarGz,
}

impl ArchiveShape {
    fn of(path: &Path) -> Option<Self> {
        let name = path.file_name()?.to_str()?.to_ascii_lowercase();
        if name.ends_with(".zip") {
            Some(Self::Zip)
        } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
            Some(Self::TarGz)
        } else {
            None
        }
    }

    /// Extract into `dest` with the same tool the product-owned installer for
    /// this shape uses, under an output cap and a wall clock.
    fn extract(self, archive: &Path, dest: &Path) -> Result<(), CaseError> {
        let (tool, args) = match self {
            Self::Zip if cfg!(windows) => (
                "powershell.exe".to_string(),
                vec![
                    OsString::from("-NoProfile"),
                    OsString::from("-NonInteractive"),
                    OsString::from("-Command"),
                    OsString::from(format!(
                        "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
                        display(archive),
                        display(dest)
                    )),
                ],
            ),
            Self::Zip => (
                "unzip".to_string(),
                vec![
                    OsString::from("-q"),
                    archive.as_os_str().to_owned(),
                    OsString::from("-d"),
                    dest.as_os_str().to_owned(),
                ],
            ),
            Self::TarGz => (
                "tar".to_string(),
                vec![
                    OsString::from("-xzf"),
                    archive.as_os_str().to_owned(),
                    OsString::from("-C"),
                    dest.as_os_str().to_owned(),
                ],
            ),
        };
        let limits = CommandLimits {
            output_cap: EXTRACT_OUTPUT_CAP,
            wall: EXTRACT_WALL,
        };
        match run_bounded(Path::new(&tool), &args, &[], None, limits) {
            Ok(outcome) if outcome.code == Some(0) => Ok(()),
            Ok(outcome) => Err(CaseError::failed(format!(
                "extracting the published archive exited {}: {}",
                describe_code(outcome.code),
                outcome.text()
            ))),
            Err(CommandFailure::Spawn(error)) => Err(EvidenceGap::ExtractionToolUnavailable {
                tool,
                detail: error.to_string(),
            }
            .into()),
            Err(other) => Err(CaseError::failed(format!(
                "extracting the published archive {other}"
            ))),
        }
    }
}

/// Digest the published archive with a bounded streaming read and prove it
/// against the sibling `.sha256` every published archive ships.
fn prove_archive_digest(archive: &Path) -> Result<String, CaseError> {
    let sibling = sibling_digest_path(archive);
    if !sibling.is_file() {
        return Err(EvidenceGap::ArchiveDigestUnavailable {
            sibling: display(&sibling),
        }
        .into());
    }
    let declared_raw = std::fs::read_to_string(&sibling)
        .map_err(|error| CaseError::failed(format!("cannot read the sibling digest: {error}")))?;
    let declared = declared_raw
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();

    let observed = digest_file(archive)?;
    if declared != observed {
        return Err(CaseError::failed(format!(
            "published archive digest {observed} does not match its sibling digest {declared}"
        )));
    }
    Ok(observed)
}

fn sibling_digest_path(archive: &Path) -> PathBuf {
    let mut name = archive.file_name().unwrap_or_default().to_os_string();
    name.push(".sha256");
    archive.with_file_name(name)
}

/// Stream a file through SHA-256 in bounded chunks, refusing anything past the
/// fixed archive ceiling rather than reading it into memory.
fn digest_file(path: &Path) -> Result<String, CaseError> {
    use sha2::{Digest as _, Sha256};

    let mut file = std::fs::File::open(path).map_err(|error| {
        CaseError::failed(format!("cannot open the published archive: {error}"))
    })?;
    let mut hasher = Sha256::new();
    let mut chunk = vec![0_u8; DIGEST_CHUNK_BYTES];
    let mut total: u64 = 0;
    loop {
        let read = file.read(&mut chunk).map_err(|error| {
            CaseError::failed(format!("reading the published archive: {error}"))
        })?;
        if read == 0 {
            break;
        }
        total = total.saturating_add(read as u64);
        if total > MAX_ARCHIVE_BYTES {
            return Err(CaseError::failed(
                "the published archive exceeds the certifier's fixed archive ceiling".to_string(),
            ));
        }
        hasher.update(&chunk[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

// ---------------------------------------------------------------------------
// Bounded execution of installed commands
// ---------------------------------------------------------------------------

/// Bounds on one executed installed command. Both a captured-output byte cap and
/// a wall clock are always present; the child is killed on either breach.
#[derive(Debug, Clone, Copy)]
struct CommandLimits {
    output_cap: usize,
    wall: Duration,
}

/// What an executed installed command produced, with output bounded by the cap.
#[derive(Debug)]
struct CommandOutcome {
    /// The real process id the command ran as, retained so a case can reason
    /// about that exact process after it has been reaped.
    pid: u32,
    code: Option<i32>,
    output: Vec<u8>,
}

impl CommandOutcome {
    /// The captured output as bounded lossy text, for a diagnostic line.
    fn text(&self) -> String {
        String::from_utf8_lossy(&self.output)
            .replace(['\r', '\n'], " ")
            .trim()
            .to_string()
    }
}

/// Why an installed command could not be executed to completion within bounds.
#[derive(Debug)]
enum CommandFailure {
    Spawn(std::io::Error),
    Timeout(Duration),
    OutputTooLarge(usize),
}

impl std::fmt::Display for CommandFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Spawn(error) => write!(f, "could not be spawned: {error}"),
            Self::Timeout(wall) => write!(f, "exceeded {wall:?} and was killed"),
            Self::OutputTooLarge(cap) => {
                write!(f, "exceeded the {cap}-byte output cap and was killed")
            }
        }
    }
}

/// Execute one installed command with both streams captured under a shared byte
/// cap and a wall clock, killing the whole spawned process TREE on either
/// breach.
///
/// The tree, not the direct child, is what must die: an installed command that
/// spawns helpers leaves those helpers holding the inherited pipe write ends, so
/// killing only the direct child would leave the drain threads blocked on a pipe
/// that never closes and the bound would be advisory rather than enforced.
///
/// Both streams are drained on their own threads so the child can never block on
/// a full pipe; the retained bytes are bounded by the cap and the drain itself is
/// time-bounded because the supervising loop kills the tree as soon as it
/// observes an overflow or passes the deadline.
fn run_bounded(
    program: &Path,
    args: &[OsString],
    envs: &[(String, String)],
    cwd: Option<&Path>,
    limits: CommandLimits,
) -> Result<CommandOutcome, CommandFailure> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in envs {
        command.env(key, value);
    }
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }

    let mut child = CertifyChild::spawn(&mut command).map_err(CommandFailure::Spawn)?;
    let pid = child.pid();
    let stdout = child
        .take_stdout()
        .ok_or_else(|| CommandFailure::Spawn(std::io::Error::other("no captured stdout")))?;
    let stderr = child
        .take_stderr()
        .ok_or_else(|| CommandFailure::Spawn(std::io::Error::other("no captured stderr")))?;

    let total = Arc::new(AtomicUsize::new(0));
    let overflow = Arc::new(AtomicBool::new(false));
    let out_reader = drain(stdout, limits.output_cap, &total, &overflow);
    let err_reader = drain(stderr, limits.output_cap, &total, &overflow);

    let deadline = Instant::now() + limits.wall;
    let mut breach: Option<CommandFailure> = None;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {}
            Err(error) => {
                child.kill_tree();
                let _ = out_reader.join();
                let _ = err_reader.join();
                return Err(CommandFailure::Spawn(error));
            }
        }
        if overflow.load(Ordering::Acquire) {
            breach = Some(CommandFailure::OutputTooLarge(limits.output_cap));
        } else if Instant::now() >= deadline {
            breach = Some(CommandFailure::Timeout(limits.wall));
        }
        if breach.is_some() {
            child.kill_tree();
            break None;
        }
        std::thread::sleep(Duration::from_millis(20));
    };

    let mut output = out_reader.join().unwrap_or_default();
    output.extend(err_reader.join().unwrap_or_default());
    if let Some(breach) = breach {
        return Err(breach);
    }
    if total.load(Ordering::Acquire) > limits.output_cap {
        return Err(CommandFailure::OutputTooLarge(limits.output_cap));
    }
    output.truncate(limits.output_cap);
    let status = status.expect("a status is present when no breach occurred");
    Ok(CommandOutcome {
        pid,
        code: status.code(),
        output,
    })
}

/// A spawned command held as its own process GROUP (Unix) or job object
/// (Windows), so a bound breach can terminate every descendant it created and
/// not merely the process the certifier launched.
enum CertifyChild {
    #[cfg(unix)]
    Unix {
        child: std::process::Child,
        pid: u32,
    },
    #[cfg(windows)]
    Windows(command_group::GroupChild),
}

impl CertifyChild {
    fn spawn(command: &mut Command) -> std::io::Result<Self> {
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt as _;
            command.process_group(0);
            let child = command.spawn()?;
            let pid = child.id();
            Ok(Self::Unix { child, pid })
        }
        #[cfg(windows)]
        {
            use command_group::CommandGroup as _;
            Ok(Self::Windows(command.group_spawn()?))
        }
    }

    /// The real process id of the spawned child.
    fn pid(&mut self) -> u32 {
        match self {
            #[cfg(unix)]
            Self::Unix { pid, .. } => *pid,
            #[cfg(windows)]
            Self::Windows(child) => child.inner().id(),
        }
    }

    fn take_stdout(&mut self) -> Option<std::process::ChildStdout> {
        match self {
            #[cfg(unix)]
            Self::Unix { child, .. } => child.stdout.take(),
            #[cfg(windows)]
            Self::Windows(child) => child.inner().stdout.take(),
        }
    }

    fn take_stderr(&mut self) -> Option<std::process::ChildStderr> {
        match self {
            #[cfg(unix)]
            Self::Unix { child, .. } => child.stderr.take(),
            #[cfg(windows)]
            Self::Windows(child) => child.inner().stderr.take(),
        }
    }

    fn try_wait(&mut self) -> std::io::Result<Option<std::process::ExitStatus>> {
        match self {
            #[cfg(unix)]
            Self::Unix { child, .. } => child.try_wait(),
            #[cfg(windows)]
            Self::Windows(child) => child.try_wait(),
        }
    }

    /// Force-kill the whole spawned tree and reap it.
    fn kill_tree(&mut self) {
        match self {
            #[cfg(unix)]
            Self::Unix { child, pid } => {
                use nix::sys::signal::{Signal, killpg};
                use nix::unistd::Pid;
                if let Ok(raw) = i32::try_from(*pid) {
                    let _ = killpg(Pid::from_raw(raw), Signal::SIGKILL);
                }
                let _ = child.wait();
            }
            #[cfg(windows)]
            Self::Windows(child) => {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// Drain one child stream on its own thread, retaining at most `cap` bytes and
/// raising the shared overflow flag once the combined streams pass the cap.
fn drain<R: Read + Send + 'static>(
    mut stream: R,
    cap: usize,
    total: &Arc<AtomicUsize>,
    overflow: &Arc<AtomicBool>,
) -> std::thread::JoinHandle<Vec<u8>> {
    let total = Arc::clone(total);
    let overflow = Arc::clone(overflow);
    std::thread::spawn(move || {
        let mut retained: Vec<u8> = Vec::new();
        let mut scratch = [0_u8; 8192];
        loop {
            match stream.read(&mut scratch) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    let seen = total.fetch_add(read, Ordering::AcqRel) + read;
                    if retained.len() < cap {
                        let keep = (cap - retained.len()).min(read);
                        retained.extend_from_slice(&scratch[..keep]);
                    }
                    if seen > cap {
                        overflow.store(true, Ordering::Release);
                    }
                }
            }
        }
        retained
    })
}

/// Execute an installed command under the standard command bounds, mapping a
/// spawn failure to a typed evidence gap naming the component.
fn execute_installed(
    component: &'static str,
    program: &Path,
    args: &[&str],
    envs: &[(String, String)],
    cwd: Option<&Path>,
) -> Result<CommandOutcome, CaseError> {
    let args: Vec<OsString> = args.iter().map(OsString::from).collect();
    let limits = CommandLimits {
        output_cap: COMMAND_OUTPUT_CAP,
        wall: COMMAND_WALL,
    };
    match run_bounded(program, &args, envs, cwd, limits) {
        Ok(outcome) => Ok(outcome),
        Err(CommandFailure::Spawn(error)) => Err(EvidenceGap::ComponentAbsent {
            component,
            relative: format!("{} ({error})", display(program)),
        }
        .into()),
        Err(other) => Err(CaseError::failed(format!(
            "the installed {component} {other}"
        ))),
    }
}

/// Execute an installed command and require it to succeed.
fn require_success(
    component: &'static str,
    program: &Path,
    args: &[&str],
    envs: &[(String, String)],
    cwd: Option<&Path>,
) -> Result<CommandOutcome, CaseError> {
    let outcome = execute_installed(component, program, args, envs, cwd)?;
    if outcome.code == Some(0) {
        Ok(outcome)
    } else {
        Err(CaseError::failed(format!(
            "the installed {component} exited {} for {:?}: {}",
            describe_code(outcome.code),
            args,
            outcome.text()
        )))
    }
}

// ---------------------------------------------------------------------------
// Network isolation
// ---------------------------------------------------------------------------

/// Prove this host has no outbound reach. A case that certifies offline
/// behaviour must not run on a networked host: a success there would prove
/// nothing about the offline property.
fn require_network_removed() -> Result<(), EvidenceGap> {
    for endpoint in ISOLATION_PROBE_ENDPOINTS {
        let address: SocketAddr = endpoint
            .parse()
            .expect("the probe endpoints are literal socket addresses");
        if TcpStream::connect_timeout(&address, ISOLATION_PROBE_TIMEOUT).is_ok() {
            return Err(EvidenceGap::NetworkReachable {
                endpoint: endpoint.to_string(),
            });
        }
    }
    if ISOLATION_PROBE_NAME.to_socket_addrs().is_ok() {
        return Err(EvidenceGap::NetworkReachable {
            endpoint: format!("{ISOLATION_PROBE_NAME} (name resolution)"),
        });
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

/// Clean installation from a locally staged artifact with network access
/// removed: the archive was digest-proven and extracted from local bytes only,
/// the installed tree matches its own member manifest under the embedded trusted
/// lock, and the installed dashboard's own verification verb succeeds — all with
/// the host proven to have no outbound reach.
fn case_clean_install_offline(artifact: &Artifact) -> CaseResult {
    require_network_removed()?;
    let dashboard = artifact.dashboard()?;
    artifact.prove_tree(&artifact.tree_root)?;
    let root = display(&artifact.tree_root);
    require_success(
        "dashboard executable",
        &dashboard,
        &["verify-release", &root],
        &[],
        None,
    )?;
    Ok(format!(
        "archive {} staged offline and verified at {root}",
        &artifact.archive_digest[..16]
    ))
}

/// Relocation preserves onedir resolution, app-home separation, receipt
/// authority, and dashboard launch: the whole tree is really moved to a second
/// path, then re-proven against its own manifest, the relocated dashboard is
/// launched to run its own verification verb at the new root, the relocated
/// frozen runtime is launched to prove its onedir still resolves from its new
/// location, and the receipt authority is shown to live under the app home
/// rather than inside the relocated tree.
fn case_relocation(artifact: &Artifact) -> CaseResult {
    let dashboard_relative = format!("bin/vaultspec{}", exe_suffix());
    let runtime_relative = format!("a2a/vaultspec-a2a{}", exe_suffix());
    // Resolve both components BEFORE moving, so an absent component reports a
    // gap against the staged tree rather than half-relocating it.
    artifact.dashboard()?;
    let runtime_present = artifact.a2a_runtime().is_ok();

    let relocated = artifact.workspace.join("relocated");
    if relocated.exists() {
        std::fs::remove_dir_all(&relocated).map_err(|error| {
            CaseError::failed(format!("cannot clear the relocation root: {error}"))
        })?;
    }
    relocate(&artifact.tree_root, &relocated)?;

    artifact.prove_tree(&relocated)?;

    let relocated_root = display(&relocated);
    let relocated_dashboard = relocated.join(&dashboard_relative);
    require_success(
        "dashboard executable",
        &relocated_dashboard,
        &["verify-release", &relocated_root],
        &[],
        None,
    )?;

    if !runtime_present {
        return Err(EvidenceGap::ComponentAbsent {
            component: "frozen A2A runtime",
            relative: runtime_relative,
        }
        .into());
    }
    let relocated_runtime = relocated.join(&runtime_relative);
    let version = require_success(
        "frozen A2A runtime",
        &relocated_runtime,
        &["--version"],
        &[],
        None,
    )?;
    if version.output.is_empty() {
        return Err(CaseError::failed(
            "the relocated frozen runtime produced no output, so its onedir resolution is unproven"
                .to_string(),
        ));
    }

    // The receipt authority is derived from the app home, never from the tree,
    // so relocating the tree cannot move or invalidate it.
    let app_home = artifact.workspace.join("app-home");
    let paths = ProductPaths::under_app_home(&app_home);
    let receipt = paths.receipt_path();
    if receipt.starts_with(&relocated) || receipt.starts_with(&artifact.tree_root) {
        return Err(CaseError::failed(format!(
            "the receipt authority at {} lives inside the relocatable product tree",
            display(&receipt)
        )));
    }
    if !paths.root().starts_with(&app_home) {
        return Err(CaseError::failed(
            "product state does not resolve under the app home".to_string(),
        ));
    }

    Ok(format!(
        "tree relocated to {relocated_root}, re-verified, both installed commands launched, receipt authority at {}",
        display(&receipt)
    ))
}

/// The runtime singleton excludes a second gateway before bind or discovery
/// publication: the installation authority is a real OS lock, a second holder is
/// excluded while the first holds it, the gateway may never take that authority
/// at all, and the exclusion is proven to happen while no discovery record has
/// been published — so the loser never bound a port or advertised itself.
fn case_runtime_singleton(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    drive_runtime_singleton(&artifact.product_paths()?)
}

fn drive_runtime_singleton(paths: &ProductPaths) -> CaseResult {
    let lock = InstallLock::new(paths.install_lock_path());

    // The gateway may never acquire or wait on installation authority.
    match lock.acquire(Actor::Gateway, "certify-gateway") {
        Err(LockError::GatewayForbidden) => {}
        other => {
            return Err(CaseError::failed(format!(
                "the gateway was not refused installation authority: {other:?}"
            )));
        }
    }

    let held = lock
        .acquire(Actor::Installer, "certify-runtime-first")
        .map_err(|error| CaseError::failed(format!("first acquisition failed: {error:?}")))?
        .map_err(|busy| {
            CaseError::failed(format!(
                "the product was already locked by {} before certification began",
                busy_owner(&busy)
            ))
        })?;

    let second = lock
        .acquire(Actor::Installer, "certify-runtime-second")
        .map_err(|error| CaseError::failed(format!("second acquisition errored: {error:?}")))?;
    let excluded = match second {
        Ok(_) => {
            return Err(CaseError::failed(
                "a second runtime acquired installation authority while the first held it"
                    .to_string(),
            ));
        }
        Err(busy) => busy,
    };
    // The recorded owner is best-effort by contract; when it IS recorded it must
    // name the live holder, never some third party.
    if let Some(owner) = &excluded.owner
        && owner != "certify-runtime-first"
    {
        return Err(CaseError::failed(format!(
            "the exclusion named {owner} rather than the live holder"
        )));
    }

    // The exclusion must land BEFORE any bind or discovery publication: a
    // discovery record present here would mean the excluded runtime advertised
    // itself before it was refused.
    let discovery = paths.app_home().join(DISCOVERY_FILE);
    if discovery.exists() {
        return Err(CaseError::failed(format!(
            "a discovery record was published at {} despite the exclusion",
            display(&discovery)
        )));
    }

    held.release()
        .map_err(|error| CaseError::failed(format!("releasing the lock failed: {error}")))?;
    Ok(format!(
        "second runtime excluded by {}, gateway refused authority, no discovery published",
        busy_owner(&excluded)
    ))
}

/// The best-effort owner a busy lock recorded, normalized for a diagnostic. The
/// contract makes the recorded owner optional, so its absence is never itself a
/// certification failure.
fn busy_owner(busy: &LockBusy) -> String {
    busy.owner
        .clone()
        .unwrap_or_else(|| "an unnamed holder".to_string())
}

/// Concurrent ensure operations attach to one job and never spawn a second
/// mutation: real concurrent contenders race the installation authority, exactly
/// one performs the mutation, and every other contender attaches by observing
/// that same holder rather than proceeding.
fn case_concurrent_ensure_single_flight(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    drive_concurrent_ensure(&artifact.product_paths()?, CONCURRENT_ENSURE_CONTENDERS)
}

fn drive_concurrent_ensure(paths: &ProductPaths, contenders: usize) -> CaseResult {
    let lock = InstallLock::new(paths.install_lock_path());
    let jobs_dir = paths.staging_dir().join("certify-ensure-jobs");
    if jobs_dir.exists() {
        std::fs::remove_dir_all(&jobs_dir)
            .map_err(|error| CaseError::failed(format!("cannot clear the job area: {error}")))?;
    }
    std::fs::create_dir_all(&jobs_dir)
        .map_err(|error| CaseError::failed(format!("cannot create the job area: {error}")))?;

    // Both barriers are what make this a single-flight proof rather than a race:
    // every contender attempts while the winner still holds, and the winner only
    // releases once every attempt has been recorded.
    let entered = std::sync::Barrier::new(contenders);
    let attempted = std::sync::Barrier::new(contenders);
    let outcomes: Vec<Result<Option<String>, String>> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..contenders)
            .map(|index| {
                let lock = lock.clone();
                let jobs_dir = jobs_dir.clone();
                let entered = &entered;
                let attempted = &attempted;
                scope.spawn(move || {
                    let owner = format!("certify-ensure-{index}");
                    entered.wait();
                    match lock.acquire(Actor::Installer, &owner) {
                        Ok(Ok(guard)) => {
                            // The single admitted mutation for this job.
                            let job = jobs_dir.join(format!("{owner}.job"));
                            let written = std::fs::write(&job, owner.as_bytes())
                                .map_err(|error| format!("job write failed: {error}"));
                            attempted.wait();
                            let released = guard.release().map_err(|error| error.to_string());
                            written.and(released).map(|()| None)
                        }
                        Ok(Err(busy)) => {
                            let holder = busy_owner(&busy);
                            attempted.wait();
                            Ok(Some(holder))
                        }
                        Err(error) => {
                            attempted.wait();
                            Err(format!("acquisition errored: {error:?}"))
                        }
                    }
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .unwrap_or_else(|_| Err("contender panicked".to_string()))
            })
            .collect()
    });

    let mut winners = 0usize;
    let mut attachments: BTreeSet<String> = BTreeSet::new();
    for outcome in outcomes {
        match outcome.map_err(CaseError::failed)? {
            None => winners += 1,
            Some(holder) => {
                attachments.insert(holder);
            }
        }
    }
    if winners != 1 {
        return Err(CaseError::failed(format!(
            "{winners} contenders held installation authority concurrently; exactly one may"
        )));
    }
    if attachments.len() != 1 {
        return Err(CaseError::failed(format!(
            "attaching contenders observed {} different holders; a single flight has exactly one",
            attachments.len()
        )));
    }

    let jobs = bounded_files(&jobs_dir)?;
    if jobs.len() != 1 {
        return Err(CaseError::failed(format!(
            "{} mutations landed for one job; concurrent ensure must mutate once",
            jobs.len()
        )));
    }
    Ok(format!(
        "{contenders} contenders, one mutation, {} attached to the single holder",
        contenders - 1
    ))
}

/// Only a matching receipt owner can quarantine stale discovery, and only after
/// proving the recorded process dead: a foreign owner's stale state is refused
/// even when its process is genuinely dead, our own stale state naming a
/// genuinely LIVE process is refused, and only our own stale state naming a
/// process this certifier really started and reaped is admitted — all under the
/// held installation lock.
fn case_stale_discovery_quarantine(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    drive_stale_discovery_quarantine(&artifact.product_paths()?)
}

fn drive_stale_discovery_quarantine(paths: &ProductPaths) -> CaseResult {
    let owner = paths.root().to_string_lossy().to_string();
    let dead = reap_a_real_process()?;
    let live = std::process::id();

    let guard = InstallLock::new(paths.install_lock_path())
        .acquire(Actor::Installer, "certify-quarantine")
        .map_err(|error| CaseError::failed(format!("acquisition failed: {error:?}")))?
        .map_err(|busy| {
            CaseError::failed(format!(
                "the product is locked by {}; quarantine cannot be certified",
                busy_owner(&busy)
            ))
        })?;

    let foreign = StaleState {
        owner: format!("{owner}-another-install"),
        pid: dead,
    };
    match quarantine_owner_matched_stale(&owner, &foreign) {
        Err(QuarantineRefusal::ForeignOwner) => {}
        other => {
            return Err(CaseError::failed(format!(
                "a foreign owner's stale state was not refused: {other:?}"
            )));
        }
    }

    let still_running = StaleState {
        owner: owner.clone(),
        pid: live,
    };
    match quarantine_owner_matched_stale(&owner, &still_running) {
        Err(QuarantineRefusal::ProcessLive) => {}
        other => {
            return Err(CaseError::failed(format!(
                "stale state naming a live process was not refused: {other:?}"
            )));
        }
    }

    let proven_dead = StaleState {
        owner: owner.clone(),
        pid: dead,
    };
    quarantine_owner_matched_stale(&owner, &proven_dead).map_err(|refusal| {
        CaseError::failed(format!(
            "the matching owner could not quarantine a proven-dead process: {refusal}"
        ))
    })?;

    guard
        .release()
        .map_err(|error| CaseError::failed(format!("releasing the lock failed: {error}")))?;
    Ok(format!(
        "foreign owner and live process both refused, proven-dead process {dead} admitted under the installation lock"
    ))
}

/// Start a real process, wait for it to exit, and reap it, returning its pid.
/// The pid is then genuinely dead — the only honest way to exercise the
/// proven-dead branch without asserting a process state that was never observed.
fn reap_a_real_process() -> Result<u32, CaseError> {
    let (program, args) = no_op_command();
    let limits = CommandLimits {
        output_cap: EXTRACT_OUTPUT_CAP,
        wall: PROBE_WALL,
    };
    let outcome = run_bounded(Path::new(&program), &args, &[], None, limits)
        .map_err(|failure| CaseError::failed(format!("the liveness probe process {failure}")))?;
    if outcome.code != Some(0) {
        return Err(CaseError::failed(format!(
            "the liveness probe process exited {}",
            describe_code(outcome.code)
        )));
    }
    Ok(outcome.pid)
}

/// A host command that starts and immediately exits successfully.
fn no_op_command() -> (String, Vec<OsString>) {
    if cfg!(windows) {
        (
            "cmd.exe".to_string(),
            ["/c", "exit 0"].iter().map(OsString::from).collect(),
        )
    } else {
        (
            "sh".to_string(),
            ["-c", "exit 0"].iter().map(OsString::from).collect(),
        )
    }
}

/// Bootstrap creates and retains distinct ownership and attach-control
/// credentials, and creates no worker credential: the dashboard's own credential
/// authority is driven under a real installation guard, both capabilities are
/// proven to be real distinct files that read back and verify, and the worker
/// IPC credential is proven absent because it is the gateway's to create, never
/// the dashboard's.
fn case_credential_separation(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    drive_credential_separation(&artifact.product_paths()?)
}

fn drive_credential_separation(paths: &ProductPaths) -> CaseResult {
    let store = DashboardCredentialStore::for_product(paths);
    let secrets = bootstrap_secrets(paths, &store)?;

    if secrets.ownership == secrets.attach_control {
        return Err(CaseError::failed(
            "ownership and attach-control share one secret; the roles are not separated"
                .to_string(),
        ));
    }

    // Both capabilities must read back through the product's own validated
    // readers and verify against what bootstrap minted.
    let ownership = store
        .read_ownership()
        .map_err(|error| CaseError::failed(format!("ownership does not read back: {error}")))?;
    let attach = store.read_attach_control().map_err(|error| {
        CaseError::failed(format!("attach-control does not read back: {error}"))
    })?;
    if !ownership.verify(&secrets.ownership) || !attach.verify(&secrets.attach_control) {
        return Err(CaseError::failed(
            "a retained credential does not verify against the one bootstrap minted".to_string(),
        ));
    }
    if ownership.verify(&secrets.attach_control) || attach.verify(&secrets.ownership) {
        return Err(CaseError::failed(
            "a credential verifies the other role's secret; the roles are interchangeable"
                .to_string(),
        ));
    }

    // Worker IPC is gateway-created and confined to gateway-worker traffic; the
    // dashboard bootstrap must never mint it.
    let worker = paths.credentials_dir().join(WORKER_IPC_CREDENTIAL);
    if worker.exists() {
        return Err(CaseError::failed(format!(
            "dashboard bootstrap created the gateway-owned worker credential at {}",
            display(&worker)
        )));
    }
    Ok(format!(
        "distinct ownership and attach-control capabilities retained under {}, no worker credential",
        display(&paths.credentials_dir())
    ))
}

/// Token values never appear in discovery, retained artifacts, diagnostics, or
/// the installed tree: both bootstrap secrets are searched for byte-for-byte
/// across every retained file outside the protected credential store, across the
/// credential's own debug rendering, and across the installed tree.
fn case_token_redaction(artifact: &Artifact) -> CaseResult {
    artifact.bind_to_real_components()?;
    let paths = artifact.product_paths()?;
    let store = DashboardCredentialStore::for_product(&paths);
    let secrets = bootstrap_secrets(&paths, &store)?;
    let tokens = [secrets.ownership.as_str(), secrets.attach_control.as_str()];

    // A credential's own rendering is the first place a secret leaks.
    let rendered = format!(
        "{:?}",
        store.read_attach_control().map_err(|error| {
            CaseError::failed(format!("attach-control does not read back: {error}"))
        })?
    );
    for token in tokens {
        if rendered.contains(token) {
            return Err(CaseError::failed(
                "a credential's debug rendering carries its secret".to_string(),
            ));
        }
    }

    // Every retained artifact outside the protected credential store, and the
    // whole installed tree, must be free of both secrets.
    let credentials_dir = paths.credentials_dir();
    let mut scanned = 0usize;
    for root in [paths.root(), artifact.tree_root.as_path()] {
        scanned += scan_for_tokens(root, &tokens, Some(&credentials_dir))?;
    }
    Ok(format!(
        "{scanned} retained files scanned across product state and the installed tree, no token present"
    ))
}

/// Both secrets minted by one real bootstrap under a real installation guard.
struct BootstrapSecrets {
    ownership: String,
    attach_control: String,
}

/// Drive the dashboard's own credential bootstrap once under a real acquired
/// installation guard, returning the minted secrets. The guard is released only
/// after bootstrap completes, so the credentials are established exactly as a
/// first install establishes them.
fn bootstrap_secrets(
    paths: &ProductPaths,
    store: &DashboardCredentialStore,
) -> Result<BootstrapSecrets, CaseError> {
    let guard = InstallLock::new(paths.install_lock_path())
        .acquire(Actor::Installer, "certify-bootstrap")
        .map_err(|error| CaseError::failed(format!("acquisition failed: {error:?}")))?
        .map_err(|busy| {
            CaseError::failed(format!(
                "the product is locked by {}; bootstrap cannot be certified",
                busy_owner(&busy)
            ))
        })?;
    let pending = store
        .begin_bootstrap(&guard)
        .map_err(|error| CaseError::failed(format!("credential bootstrap failed: {error}")))?;
    let secrets = BootstrapSecrets {
        ownership: pending.ownership().secret().to_string(),
        attach_control: pending.attach_control().secret().to_string(),
    };
    drop(pending);
    guard
        .release()
        .map_err(|error| CaseError::failed(format!("releasing the lock failed: {error}")))?;
    Ok(secrets)
}

/// Search every regular file under `root` for any of `tokens`, skipping the
/// protected credential store (which is where the secrets legitimately live).
/// Bounded by a file-count ceiling and a per-file byte ceiling; a file past the
/// byte ceiling is refused rather than read.
fn scan_for_tokens(root: &Path, tokens: &[&str], skip: Option<&Path>) -> Result<usize, CaseError> {
    let mut scanned = 0usize;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if skip.is_some_and(|skip| dir == skip) {
            continue;
        }
        if stack.len() > MAX_SCAN_DIRECTORIES {
            return Err(CaseError::failed(
                "the retained-artifact scan exceeded its directory ceiling".to_string(),
            ));
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = std::fs::symlink_metadata(&path) else {
                continue;
            };
            if metadata.is_dir() {
                stack.push(path);
            } else if metadata.is_file() {
                scanned += 1;
                if scanned > MAX_SCAN_FILES {
                    return Err(CaseError::failed(
                        "the retained-artifact scan exceeded its file ceiling".to_string(),
                    ));
                }
                if metadata.len() > MAX_SCAN_FILE_BYTES {
                    continue;
                }
                let Ok(bytes) = std::fs::read(&path) else {
                    continue;
                };
                let text = String::from_utf8_lossy(&bytes);
                for token in tokens {
                    if text.contains(token) {
                        return Err(CaseError::failed(format!(
                            "a token value is present in the retained artifact {}",
                            display(&path)
                        )));
                    }
                }
            }
        }
    }
    Ok(scanned)
}

/// The regular files directly under `dir`, bounded by the scan file ceiling.
fn bounded_files(dir: &Path) -> Result<Vec<PathBuf>, CaseError> {
    let entries = std::fs::read_dir(dir)
        .map_err(|error| CaseError::failed(format!("cannot read {}: {error}", display(dir))))?;
    let mut files = Vec::new();
    for entry in entries.flatten() {
        if files.len() >= MAX_SCAN_FILES {
            return Err(CaseError::failed(
                "the job area exceeded its file ceiling".to_string(),
            ));
        }
        if entry.path().is_file() {
            files.push(entry.path());
        }
    }
    Ok(files)
}

/// Really move a directory tree, falling back to a copy-then-remove when the
/// destination is on another volume (the case a rename cannot serve).
fn relocate(from: &Path, to: &Path) -> Result<(), CaseError> {
    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(_) => {
            copy_tree(from, to)?;
            std::fs::remove_dir_all(from).map_err(|error| {
                CaseError::failed(format!(
                    "cannot remove the original tree after copy: {error}"
                ))
            })
        }
    }
}

fn copy_tree(from: &Path, to: &Path) -> Result<(), CaseError> {
    std::fs::create_dir_all(to)
        .map_err(|error| CaseError::failed(format!("cannot create {}: {error}", display(to))))?;
    let entries = std::fs::read_dir(from)
        .map_err(|error| CaseError::failed(format!("cannot read {}: {error}", display(from))))?;
    for entry in entries {
        let entry = entry
            .map_err(|error| CaseError::failed(format!("cannot read a tree entry: {error}")))?;
        let source = entry.path();
        let dest = to.join(entry.file_name());
        let metadata = std::fs::symlink_metadata(&source).map_err(|error| {
            CaseError::failed(format!("cannot stat {}: {error}", display(&source)))
        })?;
        if metadata.is_dir() {
            copy_tree(&source, &dest)?;
        } else if metadata.is_file() {
            std::fs::copy(&source, &dest).map_err(|error| {
                CaseError::failed(format!("cannot copy {}: {error}", display(&source)))
            })?;
        } else {
            return Err(CaseError::failed(format!(
                "the installed tree contains a non-regular entry at {}",
                display(&source)
            )));
        }
    }
    Ok(())
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

    /// The streaming digest agrees with the one-shot digest of the same bytes.
    #[test]
    fn the_streaming_digest_matches_the_whole_file_digest() {
        use sha2::{Digest as _, Sha256};

        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("payload.bin");
        let bytes: Vec<u8> = (0..DIGEST_CHUNK_BYTES * 3 + 17)
            .map(|index| (index % 251) as u8)
            .collect();
        std::fs::write(&path, &bytes).unwrap();
        let expected: String = Sha256::digest(&bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        assert_eq!(digest_file(&path).unwrap(), expected);
    }

    /// A real child that outlives its wall clock is KILLED, and the breach is
    /// reported as a timeout rather than a silent pass.
    #[test]
    fn a_command_past_its_wall_clock_is_killed() {
        let (program, args) = sleeper();
        let limits = CommandLimits {
            output_cap: COMMAND_OUTPUT_CAP,
            wall: Duration::from_millis(400),
        };
        let started = Instant::now();
        let refused = run_bounded(Path::new(&program), &args, &[], None, limits);
        assert!(
            matches!(refused, Err(CommandFailure::Timeout(_))),
            "a child past its wall clock must be killed and reported: {refused:?}"
        );
        assert!(
            started.elapsed() < Duration::from_secs(20),
            "the runner must return promptly after killing the child"
        );
    }

    /// A real child that floods its output is KILLED on the byte cap.
    #[test]
    fn a_command_past_its_output_cap_is_killed() {
        let (program, args) = flooder();
        let limits = CommandLimits {
            output_cap: 4096,
            wall: Duration::from_secs(30),
        };
        let refused = run_bounded(Path::new(&program), &args, &[], None, limits);
        assert!(
            matches!(refused, Err(CommandFailure::OutputTooLarge(4096))),
            "a child past its output cap must be killed and reported: {refused:?}"
        );
    }

    /// A real child that exits cleanly is reported with its code and bounded
    /// output — the runner is not merely a killer.
    #[test]
    fn a_bounded_command_reports_its_real_exit_code() {
        let (program, args) = echoer();
        let limits = CommandLimits {
            output_cap: COMMAND_OUTPUT_CAP,
            wall: Duration::from_secs(30),
        };
        let outcome = run_bounded(Path::new(&program), &args, &[], None, limits).unwrap();
        assert_eq!(outcome.code, Some(0));
        assert!(
            outcome.text().contains("certifier"),
            "the runner must retain the child's real output: {}",
            outcome.text()
        );
    }

    /// A spawn of a program that does not exist is a spawn failure, which the
    /// installed-command helper classifies as unavailable evidence.
    #[test]
    fn an_absent_program_is_a_spawn_failure() {
        let refused = execute_installed(
            "dashboard executable",
            Path::new("/no/such/installed/command"),
            &["--version"],
            &[],
            None,
        );
        assert!(matches!(
            refused,
            Err(CaseError::Unavailable(EvidenceGap::ComponentAbsent { .. }))
        ));
    }

    /// A real product state root on a real filesystem, for driving the runtime
    /// authority cases without any stand-in for the OS primitives they use.
    fn real_product_paths(temp: &tempfile::TempDir) -> ProductPaths {
        let paths = ProductPaths::under_app_home(temp.path());
        paths.ensure().unwrap();
        paths
    }

    /// A real second acquirer is excluded by the real OS lock while the first
    /// holds it, the gateway is refused outright, and nothing was advertised.
    #[test]
    fn the_runtime_singleton_excludes_a_second_holder() {
        let temp = tempfile::tempdir().unwrap();
        let evidence = drive_runtime_singleton(&real_product_paths(&temp)).unwrap();
        assert!(
            evidence.contains("certify-runtime-first"),
            "the exclusion must name the live holder: {evidence}"
        );
    }

    /// A published discovery record while a contender is excluded means the
    /// loser advertised itself; the case must fail rather than certify.
    #[test]
    fn a_published_discovery_record_fails_the_singleton_case() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        std::fs::write(paths.app_home().join(DISCOVERY_FILE), b"{}").unwrap();
        assert!(matches!(
            drive_runtime_singleton(&paths),
            Err(CaseError::Failed(_))
        ));
    }

    /// Eight real threads race the real installation authority: exactly one
    /// mutates, and every other attaches to that same holder.
    #[test]
    fn concurrent_contenders_produce_exactly_one_mutation() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        let evidence = drive_concurrent_ensure(&paths, CONCURRENT_ENSURE_CONTENDERS).unwrap();
        assert!(
            evidence.contains("one mutation"),
            "single flight must be proven: {evidence}"
        );
        let jobs = bounded_files(&paths.staging_dir().join("certify-ensure-jobs")).unwrap();
        assert_eq!(jobs.len(), 1, "exactly one job may have mutated");
    }

    /// The real credential bootstrap mints two distinct capabilities that read
    /// back and verify, and mints no worker credential.
    #[test]
    fn credential_bootstrap_separates_the_two_roles() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        drive_credential_separation(&paths).unwrap();
        assert!(paths.credentials_dir().join("ownership.cap").exists());
        assert!(paths.credentials_dir().join("attach.cred").exists());
        assert!(
            !paths.credentials_dir().join(WORKER_IPC_CREDENTIAL).exists(),
            "worker IPC is the gateway's to create"
        );
    }

    /// Quarantine is admitted only for our own owner and only for a process
    /// this test really started and reaped; the foreign-owner and live-process
    /// branches are refused with real process facts.
    #[test]
    fn quarantine_admits_only_a_matching_owner_over_a_reaped_process() {
        let temp = tempfile::tempdir().unwrap();
        let paths = real_product_paths(&temp);
        let evidence = drive_stale_discovery_quarantine(&paths).unwrap();
        assert!(
            evidence.contains("admitted under the installation lock"),
            "the proven-dead branch must be admitted: {evidence}"
        );
    }

    /// The reaped probe really is dead: the product's own liveness authority
    /// says so, which is what makes the quarantine branch honest.
    #[test]
    fn the_reaped_probe_process_is_really_dead() {
        let pid = reap_a_real_process().unwrap();
        assert!(
            !vaultspec_product::locking::process_is_alive(pid),
            "the reaped probe process {pid} must be dead"
        );
    }

    /// A token planted in a retained artifact is found; the scan is not blind.
    #[test]
    fn the_token_scan_finds_a_planted_secret() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("state");
        std::fs::create_dir_all(root.join("nested")).unwrap();
        std::fs::write(root.join("nested/log.txt"), b"bearer aaaabbbbcccc leaked").unwrap();
        assert!(matches!(
            scan_for_tokens(&root, &["aaaabbbbcccc"], None),
            Err(CaseError::Failed(_))
        ));
    }

    /// The scan skips the protected credential store, where the secrets
    /// legitimately live, and still reports the files it did read.
    #[test]
    fn the_token_scan_skips_the_protected_credential_store() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("state");
        let credentials = root.join("credentials");
        std::fs::create_dir_all(&credentials).unwrap();
        std::fs::write(credentials.join("attach.cred"), b"aaaabbbbcccc").unwrap();
        std::fs::write(root.join("notes.txt"), b"nothing secret here").unwrap();
        let scanned = scan_for_tokens(&root, &["aaaabbbbcccc"], Some(&credentials)).unwrap();
        assert_eq!(scanned, 1, "only the non-credential file is read");
    }

    fn sleeper() -> (String, Vec<OsString>) {
        if cfg!(windows) {
            (
                "cmd.exe".to_string(),
                ["/c", "ping -n 30 127.0.0.1 >nul"]
                    .iter()
                    .map(OsString::from)
                    .collect(),
            )
        } else {
            (
                "sh".to_string(),
                ["-c", "sleep 30"].iter().map(OsString::from).collect(),
            )
        }
    }

    fn flooder() -> (String, Vec<OsString>) {
        if cfg!(windows) {
            (
                "cmd.exe".to_string(),
                [
                    "/c",
                    "for /l %i in (1,1,1000000) do @echo xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                ]
                .iter()
                .map(OsString::from)
                .collect(),
            )
        } else {
            (
                "sh".to_string(),
                ["-c", "yes xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]
                    .iter()
                    .map(OsString::from)
                    .collect(),
            )
        }
    }

    fn echoer() -> (String, Vec<OsString>) {
        if cfg!(windows) {
            (
                "cmd.exe".to_string(),
                ["/c", "echo certifier"]
                    .iter()
                    .map(OsString::from)
                    .collect(),
            )
        } else {
            (
                "sh".to_string(),
                ["-c", "echo certifier"]
                    .iter()
                    .map(OsString::from)
                    .collect(),
            )
        }
    }
}
