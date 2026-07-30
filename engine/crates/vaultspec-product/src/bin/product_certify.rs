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
