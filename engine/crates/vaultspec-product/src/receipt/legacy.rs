use super::*;

impl std::fmt::Display for ReceiptError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReceiptError::Parse(m) => write!(f, "receipt parse failed: {m}"),
            ReceiptError::Io(e) => write!(f, "receipt io error: {e}"),
        }
    }
}

impl std::error::Error for ReceiptError {}

impl From<std::io::Error> for ReceiptError {
    fn from(e: std::io::Error) -> Self {
        ReceiptError::Io(e)
    }
}

impl Receipt {
    /// A fresh bootstrap receipt: the first install atomically records the
    /// initial active generation and that it created and retains ownership.
    #[must_use]
    pub fn bootstrap(
        channel: Channel,
        target: Target,
        a2a_identity: ReleaseIdentity,
        active_generation: impl Into<String>,
        created_ms: i64,
    ) -> Self {
        Self {
            schema_version: RECEIPT_SCHEMA_VERSION.to_string(),
            state: ReceiptState::Active,
            channel,
            bootstrap_created_ownership: true,
            active_generation: active_generation.into(),
            consistency_generation: 0,
            target,
            a2a_identity,
            created_ms,
            prior_seat: None,
            interruption: None,
        }
    }

    /// Load a receipt from disk. Unlike best-effort launcher state, a malformed
    /// *active* receipt is a hard error — activation authority cannot silently
    /// default to empty.
    pub fn load(path: &std::path::Path) -> std::result::Result<Self, ReceiptError> {
        let raw = std::fs::read_to_string(path)?;
        serde_json::from_str(&raw).map_err(|e| ReceiptError::Parse(e.to_string()))
    }

    /// Atomically persist this receipt to `path`: write a pid-suffixed temp file,
    /// restrict it to the owner on Unix, then rename over the destination. A
    /// concurrent reader observes either the previous complete receipt or this
    /// one — never a torn write.
    pub fn persist(&self, path: &std::path::Path) -> std::result::Result<(), ReceiptError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let file_name = path
            .file_name()
            .map(std::ffi::OsStr::to_owned)
            .unwrap_or_else(|| std::ffi::OsString::from("receipt.json"));
        let mut tmp_name = file_name;
        tmp_name.push(format!(".tmp-{}", std::process::id()));
        let tmp = path.with_file_name(tmp_name);
        let body =
            serde_json::to_string_pretty(self).map_err(|e| ReceiptError::Parse(e.to_string()))?;
        std::fs::write(&tmp, body)?;
        crate::credentials::restrict_to_owner(&tmp)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// Commit this receipt as the live, settled active receipt: clear any
    /// interruption marker, mark it active, and persist atomically. This is the
    /// "atomic complete receipt activation" the update transaction ends with.
    pub fn activate(&mut self, path: &std::path::Path) -> std::result::Result<(), ReceiptError> {
        self.state = ReceiptState::Active;
        self.interruption = None;
        self.persist(path)
    }

    /// Record a durable interruption marker mid-transaction and persist it. The
    /// state moves to `Staged` (an in-flight candidate) unless already rolling
    /// back, so a crash after this point recovers from the exact boundary.
    pub fn mark(
        &mut self,
        marker: InterruptionMarker,
        path: &std::path::Path,
    ) -> std::result::Result<(), ReceiptError> {
        self.interruption = Some(marker);
        self.state = if marker == InterruptionMarker::RollingBack {
            ReceiptState::RollingBack
        } else {
            ReceiptState::Staged
        };
        self.persist(path)
    }
}
