//! Schema + builder proofs for the descriptor execute-intent (W03.P07.S60).
//!
//! The intent is declarative serde facts the dashboard observes on the current
//! install; the runtime `ExecuteInputs` is assembled by `build_execute_inputs`, delegating
//! every validation to the owning product constructor. A malformed or stale
//! intent is a TYPED refusal, never a silent build. These exercise the real
//! product constructors — no doubles.

use std::path::{Path, PathBuf};

use vaultspec_product::manifest::RangeBounds;
use vaultspec_product::receipt::Channel;
use vaultspec_updater::{
    ExecuteIntent, StoreIntent, UpdaterDescriptor, UpdaterError, build_execute_inputs,
};

fn range(min: &str, max: &str) -> RangeBounds {
    RangeBounds {
        minimum: min.to_string(),
        maximum: max.to_string(),
    }
}

/// A well-formed intent whose staged bundle is a real directory (the migration
/// program resolves capsule-relative under it without needing to exist).
fn valid_intent(staged_bundle: &Path) -> ExecuteIntent {
    ExecuteIntent {
        staged_bundle: staged_bundle.to_path_buf(),
        consistency_generation: 9,
        candidate_generation: "cand-1".to_string(),
        prior_generation: Some("prior-0".to_string()),
        channel: Channel::SelfInstall,
        target_head: "0008".to_string(),
        freshness_ms: 60_000,
        supported_protocol: range("v1", "v1"),
        supported_state_schema: range("0001", "9999"),
        drain_call_ms: 5_000,
        stop_ms: 5_000,
        poll_ms: 25,
        stores: vec![StoreIntent {
            id: "primary-database".to_string(),
            segments: vec!["data".to_string(), "primary.db".to_string()],
            schema_authority: "alembic-migration-range".to_string(),
            schema_version: "0008".to_string(),
        }],
        prior_seat: None,
        migration_program: vec!["no-such-migrator".to_string()],
        migration_args: Vec::new(),
        migration_output_cap: 64 * 1024,
        migration_wall_ms: 10_000,
        installed_schema_head: None,
        migration_base: "0001".to_string(),
        migration_head: "0008".to_string(),
    }
}

#[test]
fn a_descriptor_with_an_execute_intent_round_trips_through_json() {
    let temp = tempfile::tempdir().unwrap();
    let descriptor = UpdaterDescriptor {
        version: 1,
        app_home: PathBuf::from(if cfg!(windows) {
            "C:\\vaultspec\\home"
        } else {
            "/opt/vaultspec/home"
        }),
        owner: "owner-1".to_string(),
        relaunch: None,
        execute: Some(valid_intent(temp.path())),
    };

    let json = serde_json::to_string(&descriptor).unwrap();
    let parsed: UpdaterDescriptor = serde_json::from_str(&json).unwrap();
    assert_eq!(
        parsed, descriptor,
        "the execute-intent must round-trip exactly"
    );
}

#[test]
fn a_recovery_only_descriptor_parses_without_an_execute_intent() {
    // The execute field defaults to absent: an old-shape pure-recovery handoff
    // still deserializes.
    let json = r#"{"version":1,"app_home":"/opt/vaultspec/home","owner":"owner-1"}"#;
    let parsed: UpdaterDescriptor = serde_json::from_str(json).unwrap();
    assert!(parsed.execute.is_none());
    assert!(parsed.relaunch.is_none());
}

#[test]
fn an_unknown_execute_field_is_rejected() {
    let json = r#"{"version":1,"app_home":"/opt/vaultspec/home","owner":"owner-1",
        "execute":{"staged_bundle":"/tmp/b","consistency_generation":9,
        "candidate_generation":"cand-1","channel":"self-install","target_head":"0008",
        "freshness_ms":60000,"supported_protocol":{"minimum":"v1","maximum":"v1"},
        "supported_state_schema":{"minimum":"0001","maximum":"9999"},"drain_call_ms":5000,
        "stop_ms":5000,"poll_ms":25,"stores":[],"migration_program":["m"],
        "migration_output_cap":65536,"migration_wall_ms":10000,"migration_base":"0001",
        "migration_head":"0008","smuggled":true}}"#;
    let parsed: Result<UpdaterDescriptor, _> = serde_json::from_str(json);
    assert!(
        parsed.is_err(),
        "deny_unknown_fields must reject an unknown execute-intent key"
    );
}

#[test]
fn a_well_formed_intent_assembles_runtime_inputs() {
    let temp = tempfile::tempdir().unwrap();
    let (_inputs, staged) = build_execute_inputs(valid_intent(temp.path()))
        .expect("a well-formed intent must assemble runtime inputs");
    assert_eq!(
        staged,
        temp.path(),
        "build_execute_inputs must return the staged-bundle path for the verify target"
    );
}

#[test]
fn a_malformed_candidate_generation_is_a_typed_refusal() {
    let temp = tempfile::tempdir().unwrap();
    let mut intent = valid_intent(temp.path());
    // A path-escaping generation id must be rejected by the product grammar.
    intent.candidate_generation = "../escape".to_string();
    let error = build_execute_inputs(intent)
        .err()
        .expect("an invalid generation must be refused");
    assert!(
        matches!(error, UpdaterError::Transaction(_)),
        "an invalid generation must be a typed transaction refusal, got {error:?}"
    );
}

#[test]
fn a_stale_installed_schema_head_fails_closed_as_an_incompatible_range() {
    let temp = tempfile::tempdir().unwrap();
    let mut intent = valid_intent(temp.path());
    // Installed head is neither the candidate base (0001) nor the head (0008):
    // the migration range is incompatible and must fail closed, never proceed.
    intent.installed_schema_head = Some("0005".to_string());
    let error = build_execute_inputs(intent)
        .err()
        .expect("a stale installed head must be refused");
    assert!(
        matches!(error, UpdaterError::Intent(_)),
        "a stale installed head must fail closed as a typed intent refusal, got {error:?}"
    );
}
