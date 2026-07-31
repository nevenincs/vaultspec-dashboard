//! The ONE canonical declaration of every filename, directory, and environment
//! variable the dashboard shares with `vaultspec-a2a`.
//!
//! These are CONTRACT values: each names something the other product writes or
//! reads. A dashboard-internal path does not belong here; a name that must
//! agree across the repository boundary does.
//!
//! # Why this module exists
//!
//! Every one of these was previously spelled as a literal at each use site, and
//! `gateway-discovery.json` had THREE independent `const` declarations in three
//! crates. That is not a tidiness problem. A contract name repeated N times is a
//! name that drifts: when a2a renames something, the repair is N edits found by
//! grep, and the site nobody greps keeps compiling and fails at runtime against
//! a file that no longer exists. Discovery is exactly where that bit — the
//! dashboard reads one record and a2a publishes another, and both sides were
//! internally consistent about their own literal.
//!
//! So: declare each contract value ONCE, here, and import it. A rename becomes a
//! one-line change with the compiler enumerating every consumer, instead of a
//! grep whose completeness nobody can prove.
//!
//! # The two discovery records are DIFFERENT and must not be conflated
//!
//! There are two, describing two different relationships, and calling both
//! "the discovery file" is how they got confused in the first place:
//!
//! - [`GATEWAY_DISCOVERY_FILE`] — the record for a gateway the PRODUCT installed
//!   and manages. It carries product concepts (release set, install identity,
//!   state-schema range) that a resident a2a has no reason to know.
//! - [`RESIDENT_DISCOVERY_FILE`] — the record a plain `vaultspec-a2a` publishes
//!   for itself. The dashboard ATTACHES to whatever is resident and reads this.
//!
//! A consumer that wants "the running a2a" wants the resident record. A consumer
//! that wants "the gateway this product owns" wants the gateway record. Picking
//! the wrong one fails closed — it reads a healthy service as absent.

/// The secret-free discovery record a PRODUCT-MANAGED desktop gateway publishes
/// in the product app home.
///
/// Distinct from [`RESIDENT_DISCOVERY_FILE`]: this one describes a gateway the
/// dashboard installed and holds lifecycle authority over.
pub const GATEWAY_DISCOVERY_FILE: &str = "gateway-discovery.json";

/// The discovery record a RESIDENT `vaultspec-a2a` publishes for itself, in its
/// own app home.
///
/// This is a2a's own contract, not the dashboard's; the dashboard reads it to
/// attach to whatever service is already running. a2a is one resident service
/// per machine, so there is no per-scope variant.
pub const RESIDENT_DISCOVERY_FILE: &str = "service.json";

/// The owner-restricted bearer credential a2a writes beside its discovery
/// record. Discovery itself is secret-free; this file holds the token.
pub const HANDOFF_CREDENTIAL_FILE: &str = "service.token";

/// a2a's default per-user home directory, under the user's home.
pub const A2A_HOME_DIR: &str = ".vaultspec-a2a";

/// The environment variable naming an explicit a2a home, overriding
/// [`A2A_HOME_DIR`]. a2a honours this for its own state and discovery.
pub const A2A_HOME_ENV: &str = "VAULTSPEC_A2A_HOME";

/// The gateway's administrative shutdown route, absolute from the service root.
///
/// This is a2a's own contract. Its handler has always been declared at
/// `/admin/shutdown`, but it was historically REACHED through the legacy `/api`
/// mount as `/api/admin/shutdown`. With that mount deleted the declared path is
/// the served path, and root is the only correct spelling.
pub const GATEWAY_SHUTDOWN_PATH: &str = "/admin/shutdown";

/// The dashboard-owned component lock, repository-relative.
///
/// Dashboard-owned rather than shared: a2a never reads it. It is declared here
/// because it NAMES the a2a component and moves with this contract.
pub const COMPONENT_LOCK_PATH: &str = "packaging/a2a-component.lock.json";

#[cfg(test)]
mod tests {
    use super::*;

    /// The two discovery records must never collapse to one name. If a rename
    /// ever makes these equal, every "attach to the resident service" consumer
    /// silently starts reading the product-managed record and vice versa.
    #[test]
    fn the_two_discovery_records_are_distinct() {
        assert_ne!(GATEWAY_DISCOVERY_FILE, RESIDENT_DISCOVERY_FILE);
    }

    /// Discovery is secret-free by contract; the credential is a separate file.
    /// Equal names would put the bearer token inside the record every consumer
    /// is allowed to read.
    #[test]
    fn the_credential_is_not_the_discovery_record() {
        assert_ne!(HANDOFF_CREDENTIAL_FILE, RESIDENT_DISCOVERY_FILE);
        assert_ne!(HANDOFF_CREDENTIAL_FILE, GATEWAY_DISCOVERY_FILE);
    }

    /// PIN the shutdown route to the literal byte string the sibling serves.
    ///
    /// This assertion looks redundant and is not. Every other check of this
    /// route - the control client's own test, and the four loopback gateway
    /// stubs - now derives BOTH the request and the expectation from
    /// [`GATEWAY_SHUTDOWN_PATH`], so they agree with each other whatever it
    /// says. Centralising the name bought single ownership at the cost of the
    /// tests' ability to detect a wrong VALUE: set this constant to `/shutdown`
    /// and the entire suite still passes, because client and stub drift
    /// together.
    ///
    /// So exactly one assertion holds the value against the outside world. The
    /// source of truth is a2a's `api/routes/admin.py`, which declares
    /// `@router.post("/admin/shutdown")` at the service root now that the
    /// legacy `/api` mount is gone. If a2a moves that route, this is the test
    /// that fails, and it fails with the reason attached.
    #[test]
    fn the_shutdown_route_is_pinned_to_the_route_a2a_actually_serves() {
        assert_eq!(
            GATEWAY_SHUTDOWN_PATH, "/admin/shutdown",
            "a2a serves administrative shutdown at the service root; the retired \
             `/api` mount spelling (`/api/admin/shutdown`) and the never-served \
             root `/shutdown` are both wrong"
        );
        assert!(
            GATEWAY_SHUTDOWN_PATH.starts_with('/'),
            "the route is absolute from the service root, not relative"
        );
        assert!(
            !GATEWAY_SHUTDOWN_PATH.starts_with("/api/"),
            "the legacy `/api` mount is deleted; no contract path may sit under it"
        );
    }
}
