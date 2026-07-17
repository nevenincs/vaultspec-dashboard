//! The authoring store error type, shared across every store operation and
//! re-exported from the store module root.

use super::super::model::CommandKind;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("unsupported authoring store schema version {found} (supports {supported})")]
    SchemaVersion { found: i64, supported: i64 },
    #[error("corrupt authoring migration metadata: {0}")]
    MigrationMetadata(String),
    #[error("authoring idempotency record error: {0}")]
    Idempotency(String),
    #[error("authoring actor record error: {0}")]
    Actor(String),
    #[error("authoring retention record error: {0}")]
    Retention(String),
    #[error("authoring outbox event error: {0}")]
    Outbox(String),
    #[error("authoring snapshot error: {0}")]
    Snapshot(String),
    #[error("authoring validation error: {0}")]
    Validation(String),
    #[error("authoring ledger error: {0}")]
    Ledger(String),
    #[error("stale changeset revision: {0}")]
    StaleRevision(String),
    #[error("stale review revision: {0}")]
    StaleReview(String),
    #[error("authoring approval error: {0}")]
    Approval(String),
    #[error("authoring actor token error: {0}")]
    ActorToken(String),
    #[error("authoring operation mode error: {0}")]
    Mode(String),
    #[error("authoring tool permission error: {0}")]
    Permission(String),
    #[error("authoring lease error: {0}")]
    Lease(String),
    #[error("authoring review station error: {0}")]
    ReviewStation(String),
    #[error("authoring comment error: {0}")]
    Comment(String),
    #[error("authoring session error: {0}")]
    Session(String),
    #[error("authoring run authorization error: {0}")]
    RunForbidden(String),
    #[error("authoring turn queue full: {0}")]
    TurnQueueFull(String),
    #[error("command {command:?} is read-only and cannot open a mutating unit of work")]
    ReadOnlyCommandUnitOfWork { command: CommandKind },
}
