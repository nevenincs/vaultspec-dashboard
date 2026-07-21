//! The sealed archive→generation materializer and update activation
//! (archive-materialization D3–D7; a2a-product-provisioning W04 keystone).
//!
//! One sealed operation turns the opaque verified distribution capability
//! into an installed, fully verified, receipt-selected generation. It accepts
//! no caller destination, generation name, digest, format, channel, or
//! receipt fact: every trusted fact rides the non-cloneable
//! [`MaterializationSource`] borrowed from `VerifiedDistributionRelease`, the
//! generation name comes from the update transaction's validated plan, the
//! channel and ownership facts derive from the PRIOR settled receipt, and
//! provenance is minted only by the product-owned self-install adapter.
//!
//! The fixed order is: phase proof → prior-receipt facts → closed-grammar
//! archive preflight (a bounded plan, never a filesystem effect) → the
//! durable `materialize.v1` descriptor → exact generation creation → the
//! retained writer's decode/install pass → bottom-up synchronization → the
//! existing complete double-scan release verification → the tear-safe fixed
//! receipt publication (THE commit) → transaction `Activated` → descriptor
//! retirement. Any failure before the receipt commit rolls back through the
//! one existing transaction path with the prior release intact; a populated
//! unpublished generation left behind is bounded, inert residue under the
//! abandoned-generation cap until descriptor recovery reconciles it.

pub(crate) mod archive;
pub mod descriptor;
mod writer;

use std::io::{Read, Seek, SeekFrom};
use std::time::{Duration, Instant};

use vaultspec_distribution_authority::MaterializationSource;

use crate::generation::{GenerationError, LockedProduct};
use crate::manifest::{Target, UpdateReleaseFacts, verify_update_release};
use crate::receipt::{
    ActiveReceiptReadState, Channel, InterruptionMarker, PriorSeatIdentity,
    read_active_receipt_journal,
};
use crate::transaction::{ReadyToActivate, TransactionError, UpdateTransaction};

use descriptor::{MaterializeDescriptor, MaterializePhase};
use writer::GenerationWriter;

/// The canonical five-target order the synthesized cohort descriptor must
/// carry (the same closed order the manifest cohort parser enforces).
const CANONICAL_TRIPLES: [&str; 5] = [
    "aarch64-apple-darwin",
    "x86_64-apple-darwin",
    "aarch64-unknown-linux-gnu",
    "x86_64-unknown-linux-gnu",
    "x86_64-pc-windows-msvc",
];
/// Hard ceiling on the caller-supplied activation wall clock.
const MAX_WALL: Duration = Duration::from_secs(60 * 60);

/// Validated bound on the whole materialize-and-activate drive.
#[derive(Debug, Clone, Copy)]
pub struct ActivationLimits {
    wall: Duration,
}

impl ActivationLimits {
    /// Bound the drive by one wall clock covering preflight, decode/install,
    /// verification, and publication.
    pub fn new(wall: Duration) -> Result<Self, MaterializeError> {
        if wall.is_zero() || wall > MAX_WALL {
            return Err(MaterializeError::InvalidLimits(
                "activation wall clock must be positive and within the fixed ceiling",
            ));
        }
        Ok(Self { wall })
    }
}

/// The committed activation: the fixed receipt settled on the candidate and
/// the update transaction advanced to `Activated`. The updater relaunches,
/// probes, and only then advances the transaction to `Accepted`.
#[derive(Debug)]
pub struct UpdateActivated<'guard> {
    transaction: UpdateTransaction<'guard>,
    generation: String,
}

impl<'guard> UpdateActivated<'guard> {
    /// The receipt-selected generation identifier.
    #[must_use]
    pub fn generation(&self) -> &str {
        &self.generation
    }

    /// The retained transaction, for the updater's relaunch/probe acceptance.
    #[must_use]
    pub fn into_transaction(self) -> UpdateTransaction<'guard> {
        self.transaction
    }
}

/// A failed activation. Before the receipt commit the retained
/// [`ReadyToActivate`] rolls back through the one existing transaction path;
/// at or after the commit the release is selected and cannot roll back — the
/// durable descriptors carry recovery.
#[derive(Debug)]
pub struct ActivationFailure<'guard> {
    ready: Option<ReadyToActivate<'guard>>,
    committed: bool,
    error: MaterializeError,
}

impl ActivationFailure<'_> {
    /// Why activation failed.
    #[must_use]
    pub fn error(&self) -> &MaterializeError {
        &self.error
    }

    /// Whether the fixed receipt already committed the candidate. A committed
    /// activation cannot roll back; recovery resumes from the durable state.
    #[must_use]
    pub fn is_committed(&self) -> bool {
        self.committed
    }

    /// Roll the update transaction back (pre-commit failures only).
    pub fn rollback(self) -> Result<(), TransactionError> {
        match self.ready {
            Some(ready) => ready.rollback(),
            None => Err(TransactionError::InvalidPlan(
                "a committed activation cannot roll back".to_string(),
            )),
        }
    }
}

/// Materialize the verified release into the plan's candidate generation and
/// commit it through the fixed receipt (the P07 activation swap).
pub fn activate_update<'guard>(
    ready: ReadyToActivate<'guard>,
    product: &mut LockedProduct<'guard>,
    source: &mut MaterializationSource<'_>,
    limits: ActivationLimits,
    created_ms: i64,
) -> Result<UpdateActivated<'guard>, Box<ActivationFailure<'guard>>> {
    // Copy the verified facts first; the archive borrow comes last so the
    // reader and the facts never fight over the source borrow.
    let archive_length = source.archive_length();
    let archive_sha256_hex = source.archive_sha256_hex();
    let release_identity = source.release_identity().to_string();
    let target_triple = source.target().as_str().to_string();
    let member_manifest_sha256 = source.member_manifest_sha256().to_string();
    let members = source
        .members()
        .iter()
        .map(|member| {
            (
                member.target.as_str().to_string(),
                member.member_manifest_sha256.clone(),
            )
        })
        .collect();
    let component_lock = source.component_lock().to_vec();
    let capsule_root = source.capsule_root().to_string();
    let reader = match source.archive() {
        Ok(reader) => reader,
        Err(error) => {
            return Err(Box::new(ActivationFailure {
                ready: Some(ready),
                committed: false,
                error: MaterializeError::io("archive borrow", error),
            }));
        }
    };
    let feed = UpdateFeed {
        reader,
        archive_length,
        archive_sha256_hex,
        release_identity,
        target_triple,
        member_manifest_sha256,
        members,
        component_lock,
        capsule_root,
    };
    activate_update_feed(ready, product, feed, limits, created_ms)
}

/// Crate-internal activation feed: the same sealed drive over any bounded
/// reader plus verified facts. The public path derives this only from the
/// opaque distribution capability; tests construct it from real fixture
/// archives without weakening the public seal.
pub(crate) struct UpdateFeed<R: Read + Seek> {
    pub(crate) reader: R,
    pub(crate) archive_length: u64,
    pub(crate) archive_sha256_hex: String,
    pub(crate) release_identity: String,
    pub(crate) target_triple: String,
    pub(crate) member_manifest_sha256: String,
    /// `(triple, member_manifest_sha256)` in canonical five-target order.
    pub(crate) members: Vec<(String, String)>,
    pub(crate) component_lock: Vec<u8>,
    pub(crate) capsule_root: String,
}

pub(crate) fn activate_update_feed<'guard, R: Read + Seek>(
    ready: ReadyToActivate<'guard>,
    product: &mut LockedProduct<'guard>,
    mut feed: UpdateFeed<R>,
    limits: ActivationLimits,
    created_ms: i64,
) -> Result<UpdateActivated<'guard>, Box<ActivationFailure<'guard>>> {
    let mut transaction = ready.into_transaction();
    match run(&mut transaction, product, &mut feed, limits, created_ms) {
        Ok(generation) => Ok(UpdateActivated {
            transaction,
            generation,
        }),
        Err(failure) => {
            let committed = failure.committed;
            Err(Box::new(ActivationFailure {
                ready: (!committed).then(|| transaction.ready_to_activate()),
                committed,
                error: failure.error,
            }))
        }
    }
}

struct RunFailure {
    committed: bool,
    error: MaterializeError,
}

impl RunFailure {
    fn pre(error: MaterializeError) -> Self {
        Self {
            committed: false,
            error,
        }
    }

    fn committed(error: MaterializeError) -> Self {
        Self {
            committed: true,
            error,
        }
    }
}

impl From<MaterializeError> for RunFailure {
    fn from(error: MaterializeError) -> Self {
        Self::pre(error)
    }
}

fn run<R: Read + Seek>(
    transaction: &mut UpdateTransaction<'_>,
    product: &mut LockedProduct<'_>,
    feed: &mut UpdateFeed<R>,
    limits: ActivationLimits,
    created_ms: i64,
) -> Result<String, RunFailure> {
    let deadline = Instant::now() + limits.wall;
    if transaction.phase() != InterruptionMarker::Migrating {
        return Err(MaterializeError::Phase(transaction.phase()).into());
    }
    let paths = transaction.paths().clone();
    let guard = transaction.guard();

    // The updater owns activation only for the self-install channel; a
    // manager-owned channel activates through its manager (D3 of the base
    // provisioning decision) and is refused here.
    if transaction.plan().channel() != Channel::SelfInstall {
        return Err(MaterializeError::ChannelNotSelfInstall.into());
    }
    let prior = {
        let read = read_active_receipt_journal(&paths, guard)
            .map_err(|error| MaterializeError::PriorReceipt(error.to_string()))?;
        let state = read
            .state()
            .map_err(|error| MaterializeError::PriorReceipt(error.to_string()))?;
        match state {
            ActiveReceiptReadState::Settled(receipt) => PriorFacts {
                channel: receipt.channel(),
                bootstrap_created_ownership: receipt.bootstrap_created_ownership(),
                active_generation: receipt.active_generation().to_string(),
                dashboard_version: receipt.dashboard_version().to_string(),
            },
            _ => {
                return Err(MaterializeError::PriorReceipt(
                    "an update requires one settled prior receipt".to_string(),
                )
                .into());
            }
        }
    };
    if prior.channel != Channel::SelfInstall {
        return Err(MaterializeError::ChannelNotSelfInstall.into());
    }
    if transaction.plan().prior_generation() != Some(prior.active_generation.as_str()) {
        return Err(MaterializeError::PriorReceipt(
            "the plan's prior generation disagrees with the settled receipt".to_string(),
        )
        .into());
    }
    let candidate = transaction.plan().candidate_generation().to_string();
    let consistency_generation = transaction.plan().consistency_generation();

    let target = triple_to_target(&feed.target_triple)?;
    let cohort_descriptor = synthesize_cohort_descriptor(&feed.release_identity, &feed.members)?;

    // Preflight is read-only: the complete closed grammar, every decoded
    // digest, and manifest-inventory equality before any generation content.
    let plan = archive::preflight(
        &mut feed.reader,
        feed.archive_length,
        &feed.member_manifest_sha256,
        deadline,
    )?;
    // Re-prove the located member at this boundary: the plan's manifest entry
    // digest must be the independently trusted digest.
    if plan.entries[plan.manifest_index].sha256 != feed.member_manifest_sha256 {
        return Err(MaterializeError::ManifestInventory(
            "the plan's located manifest disagrees with the trusted digest".to_string(),
        )
        .into());
    }

    let mut record = MaterializeDescriptor::new(
        MaterializePhase::Preflighted,
        &feed.release_identity,
        &feed.target_triple,
        &feed.archive_sha256_hex,
        feed.archive_length,
        &feed.member_manifest_sha256,
        &candidate,
    );
    descriptor::write_descriptor(&paths, guard, &record)?;

    let mut generation = match product.create_unpublished(&candidate) {
        Ok(generation) => generation,
        Err(error) => {
            return Err(MaterializeError::CreateGeneration(error.to_string()).into());
        }
    };
    record = record.with_phase(MaterializePhase::RootCreated);
    descriptor::write_descriptor(&paths, guard, &record)?;
    record = record.with_phase(MaterializePhase::Materializing);
    descriptor::write_descriptor(&paths, guard, &record)?;

    {
        let mut writer = GenerationWriter::begin(&mut generation)?;
        for entry in &plan.entries {
            feed.reader
                .seek(SeekFrom::Start(entry.data_offset))
                .map_err(|error| MaterializeError::io("entry data seek", error))?;
            let mut decoded =
                archive::entry_reader(&mut feed.reader, entry.method, entry.compressed_size);
            writer.install_entry(
                &entry.path,
                entry.executable,
                &mut decoded,
                entry.size,
                &entry.sha256,
                deadline,
            )?;
        }
        writer.finish()?;
    }
    record = record.with_phase(MaterializePhase::TreeSynchronized);
    descriptor::write_descriptor(&paths, guard, &record)?;

    let verified = verify_update_release(
        &mut generation,
        UpdateReleaseFacts {
            target,
            member_manifest_sha256: feed.member_manifest_sha256.clone(),
            cohort_descriptor_bytes: cohort_descriptor,
            component_lock_bytes: &feed.component_lock,
            capsule_root: feed.capsule_root.clone(),
            provenance: crate::channels::self_install::SelfInstallAuthority::new().provenance(),
            channel: Channel::SelfInstall,
            // The update path CARRIES the prior settled receipt's fact; it has no
            // way to mint one, so an update can never claim bootstrap creation.
            bootstrap_created_ownership: crate::manifest::BootstrapOwnership::carried_from_prior(
                prior.bootstrap_created_ownership,
            ),
            prior_seat: Some(PriorSeatIdentity {
                generation: prior.active_generation.clone(),
                dashboard_version: prior.dashboard_version.clone(),
                pid: None,
            }),
            consistency_generation,
            created_ms,
        },
    )
    .map_err(|error| MaterializeError::Verification(error.to_string()))?;
    record = record.with_phase(MaterializePhase::Verified);
    descriptor::write_descriptor(&paths, guard, &record)?;

    // THE commit: the tear-safe fixed receipt selects the candidate.
    match crate::receipt::publish_active_receipt(verified) {
        Ok(verified) => drop(verified),
        Err(error) => {
            return Err(MaterializeError::Receipt(error.to_string()).into());
        }
    }
    drop(generation);

    record = record.with_phase(MaterializePhase::ReceiptSettled);
    descriptor::write_descriptor(&paths, guard, &record).map_err(RunFailure::committed)?;
    transaction
        .advance_activated()
        .map_err(|error| RunFailure::committed(MaterializeError::Transaction(error)))?;
    descriptor::clear_descriptor(&paths, guard).map_err(RunFailure::committed)?;
    Ok(candidate)
}

struct PriorFacts {
    channel: Channel,
    bootstrap_created_ownership: bool,
    active_generation: String,
    dashboard_version: String,
}

pub(crate) fn triple_to_target(triple: &str) -> Result<Target, MaterializeError> {
    match triple {
        "aarch64-apple-darwin" => Ok(Target::Aarch64AppleDarwin),
        "x86_64-apple-darwin" => Ok(Target::X86_64AppleDarwin),
        "aarch64-unknown-linux-gnu" => Ok(Target::Aarch64UnknownLinuxGnu),
        "x86_64-unknown-linux-gnu" => Ok(Target::X86_64UnknownLinuxGnu),
        "x86_64-pc-windows-msvc" => Ok(Target::X86_64PcWindowsMsvc),
        _ => Err(MaterializeError::Distribution(
            "unsupported distribution target triple".to_string(),
        )),
    }
}

/// Synthesize the canonical RFC 8785 five-member cohort descriptor from the
/// verified distribution members. The strings are closed ASCII grammars, so
/// fixed-order emission without escapes is exactly the canonical form the
/// verifier's cohort parser re-proves.
pub(crate) fn synthesize_cohort_descriptor(
    release_identity: &str,
    members: &[(String, String)],
) -> Result<Vec<u8>, MaterializeError> {
    if release_identity.is_empty()
        || release_identity.len() > 128
        || !release_identity
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'.' || byte == b'-')
    {
        return Err(MaterializeError::Distribution(
            "release identity is outside the closed grammar".to_string(),
        ));
    }
    if members.len() != CANONICAL_TRIPLES.len() {
        return Err(MaterializeError::Distribution(
            "the verified cohort does not carry exactly five members".to_string(),
        ));
    }
    let mut body =
        format!("{{\"digest_algorithm\":\"sha256\",\"id\":\"{release_identity}\",\"members\":[");
    for (index, ((triple, digest), expected)) in members.iter().zip(CANONICAL_TRIPLES).enumerate() {
        if triple != expected {
            return Err(MaterializeError::Distribution(
                "verified cohort members are not in canonical order".to_string(),
            ));
        }
        if digest.len() != 64
            || !digest
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(MaterializeError::Distribution(
                "verified member digest is outside the closed grammar".to_string(),
            ));
        }
        if index != 0 {
            body.push(',');
        }
        body.push_str(&format!(
            "{{\"member_manifest_digest\":\"{digest}\",\"target\":\"{triple}\"}}"
        ));
    }
    body.push_str("],\"schema_version\":\"1.0\"}");
    Ok(body.into_bytes())
}

/// Why materialization or activation failed. Bounded and secret-free.
#[derive(Debug)]
pub enum MaterializeError {
    /// The transaction was not at the activation boundary.
    Phase(InterruptionMarker),
    /// The held guard is not the canonical product installation authority.
    Authority(String),
    /// The durable materialize descriptor could not be written or read.
    Descriptor(String),
    /// The archive violated the closed deterministic grammar or its bounds.
    ArchiveGrammar(String),
    /// The archive inventory disagrees with the trusted member manifest.
    ManifestInventory(String),
    /// The bounded wall clock elapsed.
    Deadline,
    /// Retained generation authority refused an operation.
    Generation(GenerationError),
    /// The exact final-name generation could not be created.
    CreateGeneration(String),
    /// The complete double-scan release verification refused the tree.
    Verification(String),
    /// The tear-safe fixed receipt publication failed.
    Receipt(String),
    /// The prior settled receipt was absent, unreadable, or disagreed.
    PriorReceipt(String),
    /// The updater activates only the self-install channel.
    ChannelNotSelfInstall,
    /// A verified distribution fact was outside its closed grammar.
    Distribution(String),
    /// The update transaction refused a phase advance.
    Transaction(TransactionError),
    /// The caller-supplied limits were rejected.
    InvalidLimits(&'static str),
    /// A bounded filesystem operation failed.
    Io {
        /// The bounded stage.
        stage: &'static str,
        /// The operating-system error.
        source: std::io::Error,
    },
}

impl MaterializeError {
    fn io(stage: &'static str, source: std::io::Error) -> Self {
        Self::Io { stage, source }
    }
}

impl std::fmt::Display for MaterializeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Phase(phase) => {
                write!(f, "activation requires phase Migrating but was {phase:?}")
            }
            Self::Authority(detail) => write!(f, "installation authority rejected: {detail}"),
            Self::Descriptor(detail) => write!(f, "materialize descriptor failed: {detail}"),
            Self::ArchiveGrammar(detail) => write!(f, "archive grammar refused: {detail}"),
            Self::ManifestInventory(detail) => {
                write!(f, "manifest inventory refused: {detail}")
            }
            Self::Deadline => write!(f, "materialization exceeded its bounded wall clock"),
            Self::Generation(error) => write!(f, "generation authority refused: {error}"),
            Self::CreateGeneration(detail) => {
                write!(f, "generation creation failed: {detail}")
            }
            Self::Verification(detail) => {
                write!(f, "complete release verification refused: {detail}")
            }
            Self::Receipt(detail) => write!(f, "fixed receipt publication failed: {detail}"),
            Self::PriorReceipt(detail) => write!(f, "prior receipt authority failed: {detail}"),
            Self::ChannelNotSelfInstall => {
                write!(f, "the updater activates only the self-install channel")
            }
            Self::Distribution(detail) => {
                write!(f, "verified distribution fact refused: {detail}")
            }
            Self::Transaction(error) => write!(f, "update transaction refused: {error}"),
            Self::InvalidLimits(reason) => write!(f, "invalid activation limits: {reason}"),
            Self::Io { stage, source } => write!(f, "materializer {stage}: {source}"),
        }
    }
}

impl std::error::Error for MaterializeError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Generation(error) => Some(error),
            Self::Transaction(error) => Some(error),
            Self::Io { source, .. } => Some(source),
            _ => None,
        }
    }
}

#[cfg(test)]
#[path = "materializer/tests.rs"]
mod tests;
