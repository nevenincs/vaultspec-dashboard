//! Real-process acceptance for the bounded S145 dashboard contract checker.

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use vaultspec_product::manifest::{ComponentLock, Target};

const CHECKER: &str = env!("CARGO_BIN_EXE_a2a_contract_check");
const COMMITTED_LOCK: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packaging/a2a-component.lock.json"
));
const TARGET: Target = Target::X86_64PcWindowsMsvc;

struct Inputs {
    _root: tempfile::TempDir,
    lock_path: PathBuf,
    manifest_path: PathBuf,
}

impl Inputs {
    fn with_contract_version(contract_version: &str) -> Self {
        let root = tempfile::tempdir().expect("create real checker input directory");
        let lock_path = root.path().join("a2a-component.lock.json");
        let manifest_path = root.path().join("component-manifest.json");
        std::fs::write(&lock_path, COMMITTED_LOCK).expect("write real committed-lock copy");

        let lock_text = std::str::from_utf8(COMMITTED_LOCK).expect("committed lock is UTF-8");
        let lock = ComponentLock::parse(lock_text).expect("production lock parser accepts lock");
        let manifest = serde_json::json!({
            "contract_version": contract_version,
            "identity": {
                "name": lock.a2a_source.release_identity.name,
                "version": lock.a2a_source.release_identity.version
            },
            "target": TARGET.triple(),
            "compatibility": {
                "api_versions": {"minimum": "v1", "maximum": "v1"},
                "migration_range": {"base": "0001", "head": "0008"}
            },
            "consistency_group": {"stores": [
                {
                    "kind": "primary-database",
                    "derivable": false,
                    "schema_authority": "alembic-migration-range",
                    "schema_version": "0008"
                },
                {
                    "kind": "checkpoint-database",
                    "derivable": false,
                    "schema_authority": "checkpointer-schema",
                    "schema_version": "1.0.0"
                }
            ]},
            "entrypoints": {
                "gateway": {
                    "kind": "gateway",
                    "console_script": "vaultspec-a2a",
                    "reference": "vaultspec_a2a.cli:main",
                    "relative_command": ["bin", "vaultspec-a2a"]
                },
                "standalone_mcp": {
                    "kind": "standalone-mcp",
                    "console_script": "vaultspec-a2a-mcp",
                    "reference": "vaultspec_a2a.mcp:main",
                    "relative_command": ["bin", "vaultspec-a2a-mcp"]
                }
            },
            "digest_algorithm": "sha256",
            "assets": [
                {
                    "kind": "python-runtime",
                    "version": "3.13",
                    "license": lock.base_closure.python.license,
                    "digest": lock.python_digest(TARGET).expect("target Python pin")
                },
                {
                    "kind": "a2a-distribution",
                    "version": lock.a2a_source.release_identity.version,
                    "license": "MIT",
                    "digest": "1".repeat(64)
                },
                {
                    "kind": "node-runtime",
                    "version": "22",
                    "license": lock.base_closure.node.license,
                    "digest": lock.node_digest(TARGET).expect("target Node pin")
                },
                {
                    "kind": "acp-adapter",
                    "version": lock.base_closure.acp.version,
                    "license": lock.base_closure.acp.license,
                    "digest": lock.base_closure.acp.sha256
                }
            ],
            "dependency_lock": {
                "uv_lock_digest": "2".repeat(64),
                "package_lock_digest": "3".repeat(64)
            }
        });
        std::fs::write(
            &manifest_path,
            serde_json::to_vec(&manifest).expect("serialize producer-shaped manifest"),
        )
        .expect("write real detached manifest");

        Self {
            _root: root,
            lock_path,
            manifest_path,
        }
    }

    fn run(&self, target: &str) -> Output {
        run_checker(
            [self.lock_path.as_path(), self.manifest_path.as_path()],
            target,
        )
    }
}

fn run_checker<const N: usize>(paths: [&Path; N], target: &str) -> Output {
    let mut command = Command::new(CHECKER);
    command.args(paths).arg(target);
    command.output().expect("run real S145 checker process")
}

fn output_text(bytes: &[u8]) -> String {
    String::from_utf8(bytes.to_vec()).expect("checker output is UTF-8")
}

#[cfg(unix)]
fn symlink_file(target: &Path, link: &Path) {
    std::os::unix::fs::symlink(target, link).expect("create real manifest symlink");
}

#[cfg(windows)]
fn symlink_file(target: &Path, link: &Path) {
    std::os::windows::fs::symlink_file(target, link).expect("create real manifest symlink");
}

#[test]
fn accepts_only_the_detached_contract_and_disclaims_archive_authority() {
    let inputs = Inputs::with_contract_version("2.0");
    let output = inputs.run(TARGET.triple());

    assert!(output.status.success(), "{}", output_text(&output.stderr));
    assert_eq!(
        output_text(&output.stdout),
        concat!(
            "PASS detached-manifest-only target=x86_64-pc-windows-msvc; ",
            "archive=UNVERIFIED activation=UNAUTHORIZED\n"
        )
    );
    assert!(output.stderr.is_empty());
}

#[test]
fn refuses_the_pinned_producers_contract_one_manifest() {
    let inputs = Inputs::with_contract_version("1.0");
    let output = inputs.run(TARGET.triple());

    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    let stderr = output_text(&output.stderr);
    assert!(stderr.starts_with("REFUSED stage=capsule-contract detail="));
    assert!(stderr.contains("capsule.contract_version"));
    assert!(stderr.contains("expected \"2.0\", found \"1.0\""));
}

#[test]
fn refuses_a_substituted_well_formed_component_lock() {
    let inputs = Inputs::with_contract_version("2.0");
    let mut substituted: serde_json::Value =
        serde_json::from_slice(COMMITTED_LOCK).expect("parse committed lock fixture");
    substituted["description"] = serde_json::Value::String("substituted lock".to_string());
    std::fs::write(
        &inputs.lock_path,
        serde_json::to_vec(&substituted).expect("serialize substituted lock"),
    )
    .expect("replace real lock input");

    let output = inputs.run(TARGET.triple());
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert_eq!(
        output_text(&output.stderr),
        concat!(
            "REFUSED stage=component-lock-authority detail=bytes do not equal ",
            "the component lock committed into this checker\n"
        )
    );
}

#[test]
fn refuses_unknown_target_and_extra_authority_operands() {
    let inputs = Inputs::with_contract_version("2.0");
    let unknown = inputs.run("x86_64-unknown-product");
    assert_eq!(unknown.status.code(), Some(2));
    assert_eq!(
        output_text(&unknown.stderr),
        "REFUSED stage=target detail=target is not one of the five closed product triples\n"
    );

    let extra = Command::new(CHECKER)
        .args([
            inputs.lock_path.as_os_str(),
            inputs.manifest_path.as_os_str(),
            std::ffi::OsStr::new(TARGET.triple()),
            std::ffi::OsStr::new("--expected-version=caller-controlled"),
        ])
        .output()
        .expect("run checker with extra authority operand");
    assert_eq!(extra.status.code(), Some(2));
    assert_eq!(
        output_text(&extra.stderr),
        concat!(
            "REFUSED stage=invocation detail=expected exactly: <component-lock> ",
            "<capsule-manifest> <target>\n"
        )
    );
}

#[test]
fn refuses_manifest_larger_than_the_fixed_read_bound() {
    let inputs = Inputs::with_contract_version("2.0");
    let oversized = vec![b' '; 4 * 1024 * 1024 + 1];
    std::fs::write(&inputs.manifest_path, oversized).expect("write real oversized manifest");

    let output = inputs.run(TARGET.triple());
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert_eq!(
        output_text(&output.stderr),
        concat!(
            "REFUSED stage=capsule-manifest-input detail=input exceeds the fixed ",
            "byte bound\n"
        )
    );
}

#[test]
fn refuses_a_manifest_symlink_without_following_it() {
    let inputs = Inputs::with_contract_version("2.0");
    let target = inputs._root.path().join("manifest-target.json");
    std::fs::rename(&inputs.manifest_path, &target).expect("move real manifest to symlink target");
    symlink_file(&target, &inputs.manifest_path);

    let output = inputs.run(TARGET.triple());
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert_eq!(
        output_text(&output.stderr),
        "REFUSED stage=capsule-manifest-input detail=input cannot be opened no-follow\n"
    );
}

#[cfg(unix)]
#[test]
fn refuses_a_fifo_without_blocking_before_handle_validation() {
    let inputs = Inputs::with_contract_version("2.0");
    std::fs::remove_file(&inputs.manifest_path).expect("remove regular manifest input");
    let status = Command::new("mkfifo")
        .arg(&inputs.manifest_path)
        .status()
        .expect("run real mkfifo utility");
    assert!(
        status.success(),
        "mkfifo did not create the real FIFO input"
    );

    let mut child = Command::new(CHECKER)
        .args([
            inputs.lock_path.as_os_str(),
            inputs.manifest_path.as_os_str(),
            std::ffi::OsStr::new(TARGET.triple()),
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("spawn checker against real FIFO");
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
    loop {
        if child.try_wait().expect("poll checker process").is_some() {
            break;
        }
        if std::time::Instant::now() >= deadline {
            child
                .kill()
                .expect("terminate unexpectedly blocked checker");
            let _ = child.wait();
            panic!("checker blocked while opening a FIFO input");
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    let output = child
        .wait_with_output()
        .expect("collect bounded FIFO refusal output");
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert_eq!(
        output_text(&output.stderr),
        "REFUSED stage=capsule-manifest-input detail=opened input is not a regular file\n"
    );
}
