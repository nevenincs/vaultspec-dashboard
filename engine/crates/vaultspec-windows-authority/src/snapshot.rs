//! Safe, owned DACL snapshot types (windows-private-file-authority D3).
//!
//! These carry no native pointer: the private [`crate::os`] primitive copies the
//! protected-state control bit and every entry (type, flags, inheritance, mask,
//! textual SID) out of one security descriptor before freeing it, and hands back
//! the owned [`DaclSnapshot`] the safe [`crate::private_policy`] layer consumes.

/// The ACE type of one observed private-file DACL entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DaclAceKind {
    /// An `ACCESS_ALLOWED_ACE`.
    AccessAllowed,
    /// An `ACCESS_DENIED_ACE`.
    AccessDenied,
}

/// One normalized, owned DACL entry captured by the private-file snapshot.
///
/// Carries no native pointer: the SID is textual and every field is a copy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DaclEntry {
    entry_type: DaclAceKind,
    flags: u8,
    inherited: bool,
    mask: u32,
    sid: String,
}

impl DaclEntry {
    pub(crate) fn new(
        entry_type: DaclAceKind,
        flags: u8,
        inherited: bool,
        mask: u32,
        sid: String,
    ) -> Self {
        Self {
            entry_type,
            flags,
            inherited,
            mask,
            sid,
        }
    }

    /// The ACE type (allow or deny) of this entry.
    #[must_use]
    pub fn entry_type(&self) -> DaclAceKind {
        self.entry_type
    }

    /// The raw ACE header flags.
    #[must_use]
    pub fn flags(&self) -> u8 {
        self.flags
    }

    /// Whether this entry was inherited (the `INHERITED_ACE` header flag).
    #[must_use]
    pub fn inherited(&self) -> bool {
        self.inherited
    }

    /// The access mask granted or denied by this entry.
    #[must_use]
    pub fn mask(&self) -> u32 {
        self.mask
    }

    /// The textual SID of this entry's principal.
    #[must_use]
    pub fn sid(&self) -> &str {
        &self.sid
    }
}

/// A bounded, owned point-in-time observation of a private object's DACL
/// (windows-private-file-authority D3): the protected-state control bit plus the
/// normalized entry list, both drawn from ONE security descriptor so protected
/// state and entry facts can never straddle two descriptor states. The safe
/// [`crate::private_policy`] layer consumes this one snapshot for every D4 fact.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DaclSnapshot {
    protected: bool,
    entries: Vec<DaclEntry>,
}

impl DaclSnapshot {
    pub(crate) fn new(protected: bool, entries: Vec<DaclEntry>) -> Self {
        Self { protected, entries }
    }

    /// Whether the observed DACL carried `SE_DACL_PROTECTED`.
    #[must_use]
    pub fn protected(&self) -> bool {
        self.protected
    }

    /// The normalized DACL entries in ACL order.
    #[must_use]
    pub fn entries(&self) -> &[DaclEntry] {
        &self.entries
    }
}
