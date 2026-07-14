use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

use super::*;
use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
use crate::authoring::approvals::ApprovalDecision;
use crate::authoring::model::{ActorId, ChangesetStatus};

const DOC_PATH: &str = ".vault/plan/direct-save-plan.md";
const BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#direct-save'\ndate: '2026-07-06'\n---\n\n# direct save\n\nbase body\n";
const NEW_BODY: &str = "# direct save\n\nmaterialized body\n";
const CONCURRENT_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#direct-save'\ndate: '2026-07-06'\n---\n\n# direct save\n\nconcurrent body\n";
static REAL_CORE_TEST_LOCK: Mutex<()> = Mutex::new(());

struct Fx {
    _dir: tempfile::TempDir,
    root: PathBuf,
    store: Store,
    human: ActorRef,
    agent: ActorRef,
    base_hash: String,
}

fn actor(id: &str, kind: ActorKind) -> ActorRef {
    ActorRef {
        id: ActorId::new(id).unwrap(),
        kind,
        delegated_by: None,
    }
}

fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .env("GIT_AUTHOR_NAME", "direct")
        .env("GIT_AUTHOR_EMAIL", "direct@example.invalid")
        .env("GIT_COMMITTER_NAME", "direct")
        .env("GIT_COMMITTER_EMAIL", "direct@example.invalid")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn scaffold_vaultspec_workspace(root: &Path) {
    let output = Command::new("uv")
        .current_dir(root)
        .args([
            "run",
            "--no-sync",
            "vaultspec-core",
            "install",
            "--target",
            ".",
        ])
        .output()
        .expect("vaultspec-core install command runs");
    assert!(
        output.status.success() && root.join(".vaultspec").is_dir(),
        "real vaultspec-core install must succeed for direct-write tests: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn setup() -> Fx {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    git(&root, &["init", "-b", "main", "."]);
    let doc = root.join(DOC_PATH);
    std::fs::create_dir_all(doc.parent().unwrap()).unwrap();
    std::fs::write(&doc, BASE_BODY).unwrap();
    scaffold_vaultspec_workspace(&root);
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "direct fixture"]);

    let mut store = Store::open(&root.join(".vault")).unwrap();
    let human = actor("human:author", ActorKind::Human);
    let agent = actor("agent:author", ActorKind::Agent);
    register_actor(&mut store, &human, 1);
    register_actor(&mut store, &agent, 1);
    Fx {
        _dir: dir,
        root,
        store,
        human,
        agent,
        base_hash: blob_oid(BASE_BODY.as_bytes()),
    }
}

fn register_actor(store: &mut Store, actor: &ActorRef, now: i64) {
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.actors().put_record(ActorRecordInput::active(
                actor.clone(),
                ActorDisplayMetadata::new(actor.id.as_str(), None),
                now,
            ))
        })
        .unwrap();
}

fn request(expected_blob_hash: &str, body: &str) -> DirectWriteRequest {
    DirectWriteRequest {
        doc_ref: Some(DOC_PATH.to_string()),
        operation: ChangesetOperationKind::ReplaceBody,
        body: body.to_string(),
        frontmatter: None,
        new_stem: None,
        create: None,
        plan_step: None,
        expected_blob_hash: Some(expected_blob_hash.to_string()),
        summary: Some("editor save".to_string()),
        scope: None,
    }
}

fn direct_save(
    fx: &mut Fx,
    actor: &ActorRef,
    key: &str,
    expected_blob_hash: &str,
    body: &str,
    now: i64,
) -> DirectWriteOutcome {
    let adapter = CoreAdapter::detect();
    execute_direct_write(
        &mut fx.store,
        &adapter,
        &fx.root,
        actor,
        &IdempotencyKey::new(key).unwrap(),
        now,
        request(expected_blob_hash, body),
    )
    .unwrap()
}

#[test]
fn human_direct_save_self_approves_captures_preimage_and_ledgers_kind_direct() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup();
    // No capability file: direct-changeset is authoritative by default (W14.P47).
    let human = fx.human.clone();
    let base_hash = fx.base_hash.clone();
    let outcome = direct_save(
        &mut fx,
        &human,
        "idem:direct:human:1",
        &base_hash,
        NEW_BODY,
        100,
    );

    assert_eq!(outcome.status, DirectWriteStatus::Applied);
    assert!(!outcome.replayed, "first direct save is not a replay");
    assert!(!outcome.apply_replayed);
    assert!(!outcome.apply_in_flight);
    let record = outcome.record.as_ref().expect("direct record is served");
    assert_eq!(record.status, DirectWriteStatus::Applied);
    assert_eq!(
        record.authoritative_path,
        DirectWriteAuthority::DirectChangeset
    );
    assert_eq!(record.actor, human);
    assert_eq!(record.expected_blob_hash, base_hash);
    assert_eq!(record.target_blob_hash, blob_oid(NEW_BODY.as_bytes()));
    assert!(record.direct_elapsed_ms >= 0);

    let approval = outcome.approval.as_ref().expect("approval is served");
    let decision = approval.decision.as_ref().expect("approval was decided");
    assert_eq!(decision.decision, ApprovalDecision::Approve);
    assert_eq!(decision.reviewer, human);
    assert_eq!(decision.resulting_status, ChangesetStatus::Approved);

    let receipt = outcome
        .apply_receipt
        .as_ref()
        .expect("apply receipt is recorded");
    assert_eq!(receipt.state, ApplyState::Applied);
    assert_eq!(receipt.actor, human);
    assert_eq!(receipt.child.base_blob_hash, base_hash);
    assert_eq!(
        receipt.child.expected_result_blob_hash,
        record.target_blob_hash
    );
    let saved = std::fs::read_to_string(fx.root.join(DOC_PATH)).unwrap();
    assert!(saved.contains("materialized body"), "{saved}");
    assert!(!saved.contains("base body"), "{saved}");
    assert!(
        !saved.contains("# direct save\n---\n"),
        "body-only direct save must not nest frontmatter in the markdown body: {saved}"
    );

    let changeset_id = outcome.changeset_id.as_ref().unwrap().clone();
    let preimage_id = format!("preimage:{}:direct_write", changeset_id.as_str());
    let (preimage, projection, ledger_kind) = fx
        .store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let preimage = uow.snapshots().preimage(&preimage_id)?.unwrap();
            let projection = uow
                .projections()
                .project_proposal(&changeset_id, &fx.root)
                .map_err(|err| StoreError::Ledger(err.to_string()))?
                .unwrap();
            let ledger_kind = uow.ledger().latest(&changeset_id)?.unwrap().kind;
            Ok((preimage, projection, ledger_kind))
        })
        .unwrap();
    assert_eq!(preimage.payload_text, BASE_BODY);
    assert_eq!(preimage.blob_hash, base_hash);
    assert_eq!(preimage.document_path, DOC_PATH);
    // P49-R2: the direct save is a self-describing `kind=direct` changeset in the
    // ledger (no side-table join needed to know it was a human direct save).
    assert_eq!(
        ledger_kind,
        crate::authoring::model::ChangesetKind::Direct,
        "a direct save is recorded as kind=Direct in the ledger"
    );
    // Direct behaves authoring-like: it applied through the normal lifecycle and an
    // applied direct save is a legal rollback SOURCE (arch-reviewer site a).
    assert!(
        projection.rollback.available,
        "applied direct save remains rollback-available: {:?}",
        projection.rollback
    );
    let session_created_events = fx
        .store
        .with_unit_of_work(CommandKind::DirectWrite, |uow| {
            let events = uow.outbox().events_after(0, 25)?;
            Ok(events
                .into_iter()
                .filter(|event| {
                    event.event_kind == "session.created"
                        && event.aggregate_id == record.changeset_id.as_str()
                })
                .count())
        })
        .unwrap();
    assert_eq!(
        session_created_events, 0,
        "session.created must not be keyed to the changeset aggregate"
    );
    let session_created_events = fx
        .store
        .with_unit_of_work(CommandKind::DirectWrite, |uow| {
            let events = uow.outbox().events_after(0, 25)?;
            Ok(events
                .into_iter()
                .filter(|event| {
                    event.event_kind == "session.created"
                        && event.aggregate_id == record.proposal_id.as_str()
                })
                .count())
        })
        .unwrap();
    assert_eq!(
        session_created_events, 0,
        "session.created must not be keyed to the proposal aggregate"
    );
    let session_created_events = fx
        .store
        .with_unit_of_work(CommandKind::DirectWrite, |uow| {
            let events = uow.outbox().events_after(0, 25)?;
            Ok(events
                .into_iter()
                .filter(|event| {
                    event.event_kind == "session.created" && event.aggregate_kind == "session"
                })
                .count())
        })
        .unwrap();
    assert_eq!(
        session_created_events, 1,
        "direct write must publish the session.created lifecycle transition"
    );

    let stored = existing_record(
        &mut fx.store,
        &human,
        &IdempotencyKey::new("idem:direct:human:1").unwrap(),
    )
    .unwrap()
    .expect("direct record is replayable by actor/idempotency key");
    assert_eq!(stored.changeset_id, changeset_id);

    let replay = direct_save(
        &mut fx,
        &human,
        "idem:direct:human:1",
        &base_hash,
        NEW_BODY,
        101,
    );
    assert!(replay.replayed);
    assert_eq!(replay.changeset_id, outcome.changeset_id);

    let replay_conflict = execute_direct_write(
        &mut fx.store,
        &CoreAdapter::detect(),
        &fx.root,
        &human,
        &IdempotencyKey::new("idem:direct:human:1").unwrap(),
        101,
        request(&base_hash, "# different body\n"),
    )
    .unwrap_err();
    assert!(
        replay_conflict
            .to_string()
            .contains("different save payload"),
        "same idempotency key with a different payload must not replay: {replay_conflict}"
    );

    let serialized = serde_json::to_string(&outcome).unwrap();
    let temp_dir_name = fx.root.file_name().unwrap().to_string_lossy();
    assert!(
        !serialized.contains("materialized body"),
        "direct-write evidence must not leak raw document body: {serialized}"
    );
    assert!(
        !serialized.contains(temp_dir_name.as_ref()),
        "direct-write evidence must not leak absolute host paths: {serialized}"
    );

    let agent = fx.agent.clone();
    let agent_denial = direct_save(
        &mut fx,
        &agent,
        "idem:direct:agent:1",
        &blob_oid(NEW_BODY.as_bytes()),
        NEW_BODY,
        102,
    );
    assert_eq!(agent_denial.status, DirectWriteStatus::Denied);
    assert!(agent_denial.record.is_some());
    assert!(
        agent_denial
            .eligibility
            .as_ref()
            .and_then(|eligibility| eligibility.reason.as_deref())
            .is_some_and(|reason| reason.contains("agents must propose changesets")),
        "agent denial carries the direct-save provenance reason: {agent_denial:?}"
    );
    // W05.P14: the structured discriminator is set from the actor-kind gate
    // ITSELF, not by re-matching the reason text above.
    assert_eq!(
        agent_denial.denial_kind,
        Some(DirectWriteDenialKind::ForbiddenActor)
    );
    assert!(
        existing_record(
            &mut fx.store,
            &agent,
            &IdempotencyKey::new("idem:direct:agent:1").unwrap()
        )
        .unwrap()
        .is_some(),
        "agent denial must create a replayable direct-write value record"
    );
}

// W05.P14: `denial_kind` is set from the STRUCTURED `ConflictKind` finding a
// rename/create-path collision produces, never by matching the reason text —
// proven here by two collisions whose reason WORDING is completely different
// ("proposed stem" vs "predicted create path") yet both classify identically.

#[test]
fn direct_write_denies_a_rename_target_collision_with_a_structured_denial_kind() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup();
    // A different document already occupies the stem the rename targets.
    std::fs::write(
        fx.root.join(".vault/plan/direct-save-plan-taken.md"),
        "occupied\n",
    )
    .unwrap();
    let human = fx.human.clone();
    let base_hash = fx.base_hash.clone();

    let outcome = execute_direct_write(
        &mut fx.store,
        &CoreAdapter::detect(),
        &fx.root,
        &human,
        &IdempotencyKey::new("idem:direct:rename:collision").unwrap(),
        100,
        DirectWriteRequest {
            doc_ref: Some(DOC_PATH.to_string()),
            operation: ChangesetOperationKind::Rename,
            body: String::new(),
            frontmatter: None,
            new_stem: Some("direct-save-plan-taken".to_string()),
            create: None,
            plan_step: None,
            expected_blob_hash: Some(base_hash),
            summary: Some("editor rename save".to_string()),
            scope: None,
        },
    )
    .unwrap();

    assert_eq!(outcome.status, DirectWriteStatus::Denied, "{outcome:?}");
    assert_eq!(
        outcome.denial_kind,
        Some(DirectWriteDenialKind::PathCollision)
    );
    assert!(
        outcome
            .eligibility
            .as_ref()
            .and_then(|eligibility| eligibility.reason.as_deref())
            .is_some_and(|reason| reason.contains("already exists at the proposed stem")),
        "{outcome:?}"
    );
}

#[test]
fn direct_write_denies_a_create_document_path_collision_with_a_structured_denial_kind() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup();
    // now_ms=100 falls on the 1970-01-01 UTC calendar day (`ms_to_date_key`),
    // which is the deterministic create date threaded through materialization —
    // a document already occupies the create's PREDICTED path for that day.
    std::fs::create_dir_all(fx.root.join(".vault/plan")).unwrap();
    std::fs::write(
        fx.root
            .join(".vault/plan/1970-01-01-collide-create-plan.md"),
        "occupied\n",
    )
    .unwrap();
    let human = fx.human.clone();

    let outcome = execute_direct_write(
        &mut fx.store,
        &CoreAdapter::detect(),
        &fx.root,
        &human,
        &IdempotencyKey::new("idem:direct:create:collision").unwrap(),
        100,
        DirectWriteRequest {
            doc_ref: None,
            operation: ChangesetOperationKind::CreateDocument,
            body: String::new(),
            frontmatter: None,
            new_stem: None,
            create: Some(DirectWriteCreateParams {
                doc_type: "plan".to_string(),
                feature: "collide-create".to_string(),
                title: "Collide Create".to_string(),
                related: Vec::new(),
            }),
            plan_step: None,
            expected_blob_hash: None,
            summary: Some("editor new document".to_string()),
            scope: None,
        },
    )
    .unwrap();

    assert_eq!(outcome.status, DirectWriteStatus::Denied, "{outcome:?}");
    assert_eq!(
        outcome.denial_kind,
        Some(DirectWriteDenialKind::PathCollision)
    );
    assert!(
        outcome
            .eligibility
            .as_ref()
            .and_then(|eligibility| eligibility.reason.as_deref())
            .is_some_and(|reason| reason.contains("already exists at the predicted create path")),
        "{outcome:?}"
    );
}

// W14.P47 (S253): the dual-run/legacy-comparison surface is fully retired, not
// just unused — a capability payload naming the retired fields must fail closed
// (deny_unknown_fields), and a served record/outcome must carry no legacy key.
// Regression guards against silently reintroducing the dual-write bridge.
#[test]
fn direct_write_capabilities_reject_the_retired_dual_run_and_authority_fields() {
    let legacy_shaped = serde_json::json!({
        "enabled": true,
        "dual_run": true,
        "authority": "direct_changeset",
    });
    let decoded: Result<DirectWriteCapabilities, _> = serde_json::from_value(legacy_shaped);
    assert!(
        decoded.is_err(),
        "a capability payload naming retired dual_run/authority fields must not decode"
    );

    let canonical: DirectWriteCapabilities =
        serde_json::from_value(serde_json::json!({ "enabled": true })).unwrap();
    assert_eq!(canonical, DirectWriteCapabilities::enabled());
}

#[test]
fn direct_write_outcome_carries_no_legacy_key_on_the_wire() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup();
    let human = fx.human.clone();
    let base_hash = fx.base_hash.clone();
    let outcome = direct_save(
        &mut fx,
        &human,
        "idem:direct:no-legacy-wire:1",
        &base_hash,
        NEW_BODY,
        100,
    );
    assert_eq!(outcome.status, DirectWriteStatus::Applied);
    let serialized = serde_json::to_value(&outcome).unwrap();
    assert!(
        serialized.get("legacy").is_none(),
        "the retired legacy comparison must not appear on the outcome wire shape: {serialized}"
    );
    let record = serialized.get("record").expect("record is served");
    assert!(
        record.get("legacy").is_none(),
        "the retired legacy comparison must not appear on the record wire shape: {record}"
    );
}

#[test]
fn stale_expected_blob_hash_conflicts_and_does_not_apply() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup();
    let human = fx.human.clone();
    let base_hash = fx.base_hash.clone();
    std::fs::write(fx.root.join(DOC_PATH), CONCURRENT_BODY).unwrap();
    let concurrent_hash = blob_oid(CONCURRENT_BODY.as_bytes());

    let outcome = direct_save(
        &mut fx,
        &human,
        "idem:direct:conflict:1",
        &base_hash,
        NEW_BODY,
        200,
    );

    assert_eq!(outcome.status, DirectWriteStatus::Conflict);
    assert!(outcome.changeset_id.is_none());
    assert!(outcome.record.is_some());
    let conflict = outcome.conflict.as_ref().expect("conflict is served");
    assert_eq!(conflict.expected_blob_hash, base_hash);
    assert_eq!(conflict.actual_blob_hash, concurrent_hash);
    assert_eq!(conflict.target_blob_hash, blob_oid(NEW_BODY.as_bytes()));
    assert_eq!(
        std::fs::read_to_string(fx.root.join(DOC_PATH)).unwrap(),
        CONCURRENT_BODY,
        "stale direct save must not modify the live checkout"
    );
    assert!(
        existing_record(
            &mut fx.store,
            &human,
            &IdempotencyKey::new("idem:direct:conflict:1").unwrap()
        )
        .unwrap()
        .is_some(),
        "conflicted direct save must create a replayable direct-write value record"
    );

    std::fs::write(fx.root.join(DOC_PATH), BASE_BODY).unwrap();
    let replay = direct_save(
        &mut fx,
        &human,
        "idem:direct:conflict:1",
        &base_hash,
        NEW_BODY,
        201,
    );
    assert!(replay.replayed);
    assert_eq!(replay.status, DirectWriteStatus::Conflict);
    assert!(
        std::fs::read_to_string(fx.root.join(DOC_PATH))
            .unwrap()
            .contains("base body"),
        "conflict replay must not re-evaluate and apply after the document changes"
    );

    let serialized = serde_json::to_string(&outcome).unwrap();
    let temp_dir_name = fx.root.file_name().unwrap().to_string_lossy();
    assert!(!serialized.contains("materialized body"));
    assert!(!serialized.contains(temp_dir_name.as_ref()));
}

/// Plan-step tick (authoring-surface ADR D1) round-trip against the REAL
/// vaultspec-core over a canonical plan, exercising the full direct-write
/// lifecycle end to end: materialize → self-approve → apply the
/// `SetPlanStepState` capability → the watcher-observed served state.
mod plan_tick {
    use std::time::Duration;

    use super::*;
    use crate::authoring::api::{PlanStepEdit, PlanStepState};

    struct PlanFx {
        _dir: tempfile::TempDir,
        root: PathBuf,
        store: Store,
        human: ActorRef,
        plan_ref: String,
        base_hash: String,
    }

    /// Run a real `vaultspec-core` verb in the worktree, asserting success.
    fn core(root: &Path, args: &[&str]) {
        let output = Command::new("uv")
            .current_dir(root)
            .args(["run", "--no-sync", "vaultspec-core"])
            .args(args)
            .output()
            .expect("vaultspec-core runs");
        assert!(
            output.status.success(),
            "vaultspec-core {args:?}: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    /// A real worktree carrying a canonical L1 plan with two open steps,
    /// scaffolded THROUGH core — a hand-written plan's step rows are stripped
    /// by core's serializer as unknown prose, so the fixture is built the
    /// only way that survives a real `plan step` write.
    fn setup_plan() -> PlanFx {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        git(&root, &["init", "-b", "main", "."]);
        scaffold_vaultspec_workspace(&root);
        core(&root, &["vault", "add", "plan", "--feature", "ticktest"]);
        let plan_path = std::fs::read_dir(root.join(".vault/plan"))
            .unwrap()
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .find(|path| path.extension().map(|ext| ext == "md").unwrap_or(false))
            .expect("scaffolded plan exists");
        let plan_ref = plan_path
            .strip_prefix(&root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        core(
            &root,
            &[
                "vault",
                "plan",
                "step",
                "add",
                &plan_ref,
                "--action",
                "first step",
                "--scope",
                "src/a.rs",
            ],
        );
        core(
            &root,
            &[
                "vault",
                "plan",
                "step",
                "add",
                &plan_ref,
                "--action",
                "second step",
                "--scope",
                "src/b.rs",
            ],
        );
        git(&root, &["add", "."]);
        git(&root, &["commit", "-m", "plan tick fixture"]);
        let base_hash = blob_oid(&std::fs::read(&plan_path).unwrap());

        let mut store = Store::open(&root.join(".vault")).unwrap();
        let human = actor("human:author", ActorKind::Human);
        register_actor(&mut store, &human, 1);
        PlanFx {
            _dir: dir,
            root,
            store,
            human,
            plan_ref,
            base_hash,
        }
    }

    fn tick_request(
        plan_ref: &str,
        expected: &str,
        step_id: &str,
        check: bool,
    ) -> DirectWriteRequest {
        DirectWriteRequest {
            doc_ref: Some(plan_ref.to_string()),
            operation: ChangesetOperationKind::SetPlanStepState,
            body: String::new(),
            frontmatter: None,
            new_stem: None,
            create: None,
            plan_step: Some(PlanStepEdit {
                step_id: step_id.to_string(),
                state: if check {
                    PlanStepState::Checked
                } else {
                    PlanStepState::Unchecked
                },
            }),
            expected_blob_hash: Some(expected.to_string()),
            summary: Some("status rail tick".to_string()),
            scope: None,
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn tick_save(
        fx: &mut PlanFx,
        adapter: &CoreAdapter,
        actor: &ActorRef,
        key: &str,
        expected: &str,
        step_id: &str,
        check: bool,
        now: i64,
    ) -> DirectWriteOutcome {
        let request = tick_request(&fx.plan_ref, expected, step_id, check);
        execute_direct_write(
            &mut fx.store,
            adapter,
            &fx.root,
            actor,
            &IdempotencyKey::new(key).unwrap(),
            now,
            request,
        )
        .unwrap()
    }

    /// The current `done` state of a Step, parsed with the SAME
    /// `ingest_struct` parser the served projection uses — so the test
    /// asserts on the value a reader would actually see.
    fn step_done(fx: &PlanFx, step_id: &str) -> Option<bool> {
        let text = std::fs::read_to_string(fx.root.join(&fx.plan_ref)).unwrap();
        ingest_struct::plan_structure::parse_plan_structure(&text)
            .steps
            .iter()
            .find(|step| step.id == step_id)
            .map(|step| step.done)
    }

    fn current_hash(fx: &PlanFx) -> String {
        blob_oid(&std::fs::read(fx.root.join(&fx.plan_ref)).unwrap())
    }

    /// A shell adapter that runs the REAL `plan step` verb (landing the
    /// write) then sleeps past a short deadline — the outcome-indeterminate
    /// (Timeout) falsifier for the core-authoritative post-verify.
    fn landing_tick_timeout_adapter(plan_ref: &str, step_id: &str, check: bool) -> CoreAdapter {
        let verb = if check { "check" } else { "uncheck" };
        let invocation = if cfg!(windows) {
            vec![
                "powershell".to_string(),
                "-NoProfile".into(),
                "-Command".into(),
                format!(
                    "& {{ uv run --no-sync vaultspec-core vault plan step {verb} '{plan_ref}' \
                         '{step_id}' --json | Out-Null; Start-Sleep -Seconds 30 }}"
                ),
            ]
        } else {
            vec![
                "sh".to_string(),
                "-c".into(),
                format!(
                    "uv run --no-sync vaultspec-core vault plan step {verb} '{plan_ref}' \
                         '{step_id}' --json >/dev/null 2>&1; sleep 30"
                ),
            ]
        };
        CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_secs(10))
    }

    /// The full plan-tick lifecycle against the REAL core, consolidating
    /// three behaviours in one end-to-end run: (1) the check→uncheck
    /// ROUND-TRIP restores the target step's served state; (2) an idempotent
    /// re-tick of an already-closed step is Applied via the core `unchanged`
    /// success status, never a false failure; and (3) the uncheck INVERSE
    /// (exactly what `rollback.rs` generates for a plan-tick source) flips
    /// ONLY the target step, leaving a CONCURRENT sibling tick intact — the
    /// clobber the retired W01.P01 rollback-unavailable gate guarded against
    /// (a whole-document preimage restore would have reverted S02 too).
    #[test]
    fn plan_step_tick_round_trip_is_sibling_safe_and_idempotent() {
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup_plan();
        let human = fx.human.clone();
        let base_hash = fx.base_hash.clone();
        let adapter = CoreAdapter::detect();

        assert_eq!(step_done(&fx, "S01"), Some(false), "S01 starts open");

        let check = tick_save(
            &mut fx,
            &adapter,
            &human,
            "idem:tick:check:1",
            &base_hash,
            "S01",
            true,
            100,
        );
        assert_eq!(
            check.status,
            DirectWriteStatus::Applied,
            "{:?}",
            check.eligibility
        );
        let receipt = check.apply_receipt.as_ref().expect("apply receipt");
        assert_eq!(receipt.state, ApplyState::Applied);
        assert!(
            !receipt.child.resolved_via_post_verify,
            "a clean success completes via the envelope"
        );
        assert_eq!(step_done(&fx, "S01"), Some(true), "S01 is closed");

        // A CONCURRENT sibling tick.
        let h1 = current_hash(&fx);
        let check2 = tick_save(
            &mut fx,
            &adapter,
            &human,
            "idem:tick:check:2",
            &h1,
            "S02",
            true,
            150,
        );
        assert_eq!(
            check2.status,
            DirectWriteStatus::Applied,
            "{:?}",
            check2.eligibility
        );
        assert_eq!(step_done(&fx, "S02"), Some(true), "S02 is closed");

        // Idempotent re-tick of the already-closed S01: core reports
        // `unchanged` (a success), not a false failure, and the file is not
        // rewritten.
        let h2 = current_hash(&fx);
        let again = tick_save(
            &mut fx,
            &adapter,
            &human,
            "idem:tick:again",
            &h2,
            "S01",
            true,
            200,
        );
        assert_eq!(
            again.status,
            DirectWriteStatus::Applied,
            "an idempotent re-tick is Applied, not a false failure: {:?}",
            again.eligibility
        );
        assert_eq!(
            again
                .apply_receipt
                .as_ref()
                .and_then(|receipt| receipt.child.core_status.as_deref()),
            Some("unchanged"),
            "the idempotent re-tick rode the core `unchanged` success status"
        );

        // The uncheck INVERSE of the S01 tick — the operation `rollback.rs`
        // generates. It must re-open ONLY S01 and leave the S02 tick intact.
        let h3 = current_hash(&fx);
        let uncheck = tick_save(
            &mut fx,
            &adapter,
            &human,
            "idem:tick:uncheck:1",
            &h3,
            "S01",
            false,
            300,
        );
        assert_eq!(
            uncheck.status,
            DirectWriteStatus::Applied,
            "{:?}",
            uncheck.eligibility
        );
        assert_eq!(
            step_done(&fx, "S01"),
            Some(false),
            "the inverse re-opened only S01"
        );
        assert_eq!(
            step_done(&fx, "S02"),
            Some(true),
            "the concurrent S02 tick SURVIVES the inverse — no whole-document clobber"
        );
    }

    #[test]
    fn plan_step_tick_stale_base_refuses_without_mutating_the_plan() {
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup_plan();
        let human = fx.human.clone();
        let adapter = CoreAdapter::detect();
        // A well-formed but non-matching base fence (the engine-side
        // substitute for the plan CLI's absent expected-blob-hash flag).
        let stale = "0".repeat(40);

        let outcome = tick_save(
            &mut fx,
            &adapter,
            &human,
            "idem:tick:stale:1",
            &stale,
            "S01",
            true,
            100,
        );
        assert_eq!(
            outcome.status,
            DirectWriteStatus::Conflict,
            "{:?}",
            outcome.eligibility
        );
        assert!(outcome.changeset_id.is_none());
        let conflict = outcome.conflict.as_ref().expect("conflict served");
        assert_eq!(conflict.expected_blob_hash, stale);
        assert_eq!(
            step_done(&fx, "S01"),
            Some(false),
            "a stale-base tick must never mutate the plan"
        );
    }

    #[test]
    fn plan_step_tick_indeterminate_kill_after_a_real_landed_tick_is_recognized_applied() {
        // THE R1 pattern for the plan tick: the plan CLI verb is
        // core-authoritative over the resulting bytes (glyph + modified stamp
        // + display-path recompute), so a blob-hash compare is unsound.
        // A mid-flight kill after the REAL write landed must still be
        // recognized Applied via the step-state re-read.
        let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
        let mut fx = setup_plan();
        let human = fx.human.clone();
        let base_hash = fx.base_hash.clone();
        let plan_ref = fx.plan_ref.clone();
        let adapter = landing_tick_timeout_adapter(&plan_ref, "S01", true);

        let outcome = tick_save(
            &mut fx,
            &adapter,
            &human,
            "idem:tick:kill:1",
            &base_hash,
            "S01",
            true,
            100,
        );
        assert_eq!(
            outcome.status,
            DirectWriteStatus::Applied,
            "the REAL landed tick must be recognized Applied via post-verify: {:?}",
            outcome.eligibility
        );
        let receipt = outcome
            .apply_receipt
            .as_ref()
            .expect("an indeterminate kill still resolves to a terminal receipt");
        assert_eq!(receipt.state, ApplyState::Applied);
        assert!(
            receipt.child.resolved_via_post_verify,
            "recognized via the step-state re-read, not the (killed) envelope"
        );
        assert_eq!(
            step_done(&fx, "S01"),
            Some(true),
            "the real landed tick is reflected in the served plan"
        );
    }
}
