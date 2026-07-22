//! Safe shared validation of a private-file DACL snapshot
//! (windows-private-file-authority D3/D4).
//!
//! This module contains NO unsafe code and no native call. It consumes ONE
//! [`crate::DaclSnapshot`] — the single-descriptor observation the D9 `os`
//! primitive produces — and decides every fact from it. Because both the
//! protected bit and the entry list come from one snapshot, a claim about them
//! can never straddle two descriptor states.
//!
//! Two policies live here, and they are NOT interchangeable:
//!
//! - The STRICT private-authority policy ([`validate_private_file`],
//!   [`validate_private_directory`]) decides every D4 fact: `SE_DACL_PROTECTED`,
//!   zero inherited entries, exactly the three explicit allow entries for the
//!   current user, LocalSystem, and built-in Administrators, exact masks and
//!   inheritance flags, and duplicate rejection. It applies to objects this
//!   authority itself created to that exact shape.
//! - The LOOSER no-outside-principal policy
//!   ([`validate_no_outside_principal`]) decides only that no principal outside
//!   those three is granted anything. It applies to objects that merely must not
//!   leak authority — an installed product object, a discovered handoff
//!   descriptor — which this authority did not create and cannot require to be
//!   protected.
//!
//! Anything else fails closed as a typed [`PrivatePolicyViolation`].

use crate::{DaclAceKind, DaclSnapshot};

// The fixed private-file policy is SINGLE-SOURCED here (windows-private-file-
// authority, private-file class addendum). Every consumer that installs entries
// with the `windows-acl` mutation layer imports these exact values; no consumer
// may declare its own principal, mask, or flag literal. Drift then becomes
// impossible rather than merely discouraged: a consumer that installs anything
// other than what the shared validator below requires fails its own validation
// immediately, in production and in the NTFS acceptance evidence.

/// LocalSystem.
pub const LOCAL_SYSTEM_SID: &str = "S-1-5-18";
/// Built-in Administrators.
pub const ADMINISTRATORS_SID: &str = "S-1-5-32-544";
/// `FILE_ALL_ACCESS` — the exact mask every private-authority allow entry grants.
pub const FILE_ALL_ACCESS: u32 = 0x001f_01ff;
/// Explicit (non-inherited, non-propagating) file ACE header flags.
pub const FILE_EXPLICIT_FLAGS: u8 = 0x00;
/// Explicit directory ACE header flags: `OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE`.
pub const DIRECTORY_EXPLICIT_FLAGS: u8 = 0x03;

/// A private-authority DACL that does not meet the complete D4 validation.
#[derive(Debug)]
pub struct PrivatePolicyViolation {
    detail: String,
}

impl PrivatePolicyViolation {
    fn new(detail: impl Into<String>) -> Self {
        Self {
            detail: detail.into(),
        }
    }

    /// The specific reason validation failed.
    #[must_use]
    pub fn detail(&self) -> &str {
        &self.detail
    }
}

impl std::fmt::Display for PrivatePolicyViolation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "private-file DACL policy violation: {}", self.detail)
    }
}

impl std::error::Error for PrivatePolicyViolation {}

/// Validate that `snapshot` is the exact protected three-principal DACL required
/// of a private FILE (windows-private-file-authority D4).
///
/// `current_user_sid` is caller-supplied (consumers derive it with
/// `windows_acl::helper::{current_user, name_to_sid, sid_to_string}`).
pub fn validate_private_file(
    snapshot: &DaclSnapshot,
    current_user_sid: &str,
) -> Result<(), PrivatePolicyViolation> {
    validate(snapshot, current_user_sid, FILE_EXPLICIT_FLAGS)
}

/// Validate that `snapshot` is the exact protected three-principal DACL required
/// of a private DIRECTORY (windows-private-file-authority D4), whose explicit
/// entries additionally carry the container/object inheritance flags.
pub fn validate_private_directory(
    snapshot: &DaclSnapshot,
    current_user_sid: &str,
) -> Result<(), PrivatePolicyViolation> {
    validate(snapshot, current_user_sid, DIRECTORY_EXPLICIT_FLAGS)
}

/// Validate that `snapshot` grants access to NO principal outside the current
/// user, LocalSystem, and built-in Administrators, and that the current user is
/// itself granted something.
///
/// This is DELIBERATELY weaker than [`validate_private_file`] /
/// [`validate_private_directory`], and the difference is load-bearing: it does
/// not require `SE_DACL_PROTECTED`, does not fix the entry count, and pins
/// neither masks nor inheritance flags. Its consumers observe objects they did
/// not create — an installed product object, a discovered handoff descriptor, a
/// generation directory — which legitimately carry inherited entries and extra
/// grants to the SAME three principals. Substituting the strict validator at
/// those call sites would reject conforming objects; substituting this one where
/// the strict policy is required would accept an unprotected descriptor.
///
/// Deny entries are ignored: a deny ACE only ever subtracts access, so it can
/// never delegate authority to an outside principal.
///
/// `current_user_sid` is caller-supplied, on the same contract as the strict
/// validators above.
pub fn validate_no_outside_principal(
    snapshot: &DaclSnapshot,
    current_user_sid: &str,
) -> Result<(), PrivatePolicyViolation> {
    let mut current_user_granted = false;
    for entry in snapshot.entries() {
        match entry.entry_type() {
            DaclAceKind::AccessAllowed => {
                let sid = entry.sid();
                if sid != current_user_sid && sid != LOCAL_SYSTEM_SID && sid != ADMINISTRATORS_SID {
                    return Err(PrivatePolicyViolation::new(format!(
                        "DACL grants access to outside principal {sid}"
                    )));
                }
                current_user_granted |= sid == current_user_sid;
            }
            DaclAceKind::AccessDenied => {}
        }
    }
    if !current_user_granted {
        return Err(PrivatePolicyViolation::new(
            "DACL grants the current user no access",
        ));
    }
    Ok(())
}

fn validate(
    snapshot: &DaclSnapshot,
    current_user_sid: &str,
    required_flags: u8,
) -> Result<(), PrivatePolicyViolation> {
    if !snapshot.protected() {
        return Err(PrivatePolicyViolation::new("DACL is not SE_DACL_PROTECTED"));
    }

    let entries = snapshot.entries();
    if entries.iter().any(|entry| entry.inherited()) {
        return Err(PrivatePolicyViolation::new(
            "DACL carries at least one inherited entry",
        ));
    }

    let required = [current_user_sid, LOCAL_SYSTEM_SID, ADMINISTRATORS_SID];
    if entries.len() != required.len() {
        return Err(PrivatePolicyViolation::new(format!(
            "DACL must hold exactly {} explicit allow entries, found {}",
            required.len(),
            entries.len()
        )));
    }

    // Each of the three fixed principals must match exactly one conforming allow
    // entry. With the length pinned to three above, exactly-once-each also rules
    // out foreign principals, deny entries, duplicates, and mask/flag drift.
    for principal in required {
        let matches = entries
            .iter()
            .filter(|entry| {
                entry.entry_type() == DaclAceKind::AccessAllowed
                    && entry.sid() == principal
                    && entry.mask() == FILE_ALL_ACCESS
                    && entry.flags() == required_flags
                    && !entry.inherited()
            })
            .count();
        if matches != 1 {
            return Err(PrivatePolicyViolation::new(format!(
                "principal {principal} must have exactly one conforming allow entry, found {matches}"
            )));
        }
    }

    Ok(())
}
