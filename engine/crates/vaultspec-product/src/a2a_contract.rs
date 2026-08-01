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

// ---------------------------------------------------------------------------
// Clarification bounds
// ---------------------------------------------------------------------------
//
// These are a2a's numbers, not the dashboard's. Every one is a hard refusal at
// the sibling's own boundary, enforced BEFORE any run state is read - so a value
// the dashboard admits and a2a does not is not a lenient boundary, it is a 422
// the user cannot act on and a run that stays parked.
//
// They live here for the reason the whole module exists: the engine once
// declared its own literals and the frontend a second set, each internally
// consistent and neither reconciled with a2a, while the tests meant to catch
// that were sized FROM the constants they checked and stayed green through the
// drift. One declaration, pinned once against the sibling, is the repair.
//
// ARBITER (2026-08-01). Two captures of these bounds existed, taken from two
// different a2a trees, and disagreed on two of the five. They are reconciled
// here against the SERVED contract rather than against either capture's source
// reading: `openapi.json` fetched live from the gateway on 127.0.0.1:18100,
// serving `feature/agent-flow` at eafacbe5+, the same stack the panel drives.
// That document declares, on `RunClarificationRespondRequest` and on the
// `/v1/runs/{run_id}/clarifications/{request_id}/respond` route:
//
//     answers.additionalProperties.maxLength  4096   (answer value)
//     answers.propertyNames.maxLength           64   (question id / map key)
//     answers.maxProperties                      4
//     path param request_id  maxLength           64
//     path param run_id      maxLength          128
//
// The run id is the parameter that takes 128; the request id does not, and an
// id past 64 is refused by a2a's own path validation before the engine is
// reached. Re-derive from the same document before changing any number here -
// a source reading of one a2a tree is not evidence about the tree we serve.

/// The most questions one clarification request may carry.
///
/// a2a: `MAX_QUESTIONS_PER_REQUEST`, enforced on
/// `ClarificationRequest.questions` and again on `ClarificationAnswers.answers`,
/// so it bounds the ANSWER side the engine forwards as well as the question set.
pub const A2A_MAX_CLARIFICATION_QUESTIONS: usize = 4;

/// The most options one `choice` question may declare.
///
/// a2a: `MAX_OPTIONS_PER_QUESTION`, enforced on `ClarificationQuestion.options`.
pub const A2A_MAX_CLARIFICATION_OPTIONS: usize = 4;

/// The longest a single answer may be.
///
/// a2a: the `answers` map's value bound on
/// `RunClarificationRespondRequest` - `additionalProperties.maxLength: 4096`.
pub const A2A_MAX_CLARIFICATION_ANSWER_CHARS: usize = 4096;

/// The longest a clarification request id may be.
///
/// a2a: the `request_id` PATH parameter of
/// `/v1/runs/{run_id}/clarifications/{request_id}/respond` -
/// `maxLength: 64`, `pattern: ^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$`. It is the run
/// id, at `maxLength: 128`, that takes the wider bound; the two are separate
/// parameters on the same route and are not interchangeable.
pub const A2A_MAX_CLARIFICATION_REQUEST_ID_CHARS: usize = 64;

/// The longest a question id may be.
///
/// a2a: `MAX_IDENTIFIER_CHARS`, carried by `QuestionId` - which is also the key
/// type of the `answers` map the engine forwards.
pub const A2A_MAX_CLARIFICATION_IDENTIFIER_CHARS: usize = 64;

// Two build-time asserts stood here encoding a relationship the wire does not
// have: that the request id must exceed the identifier cap because a2a mints it
// as `clarify-{thread_id}`. The served route contradicts both - `request_id` and
// `run_id` are separate path parameters bounded independently at 64 and 128, and
// an id longer than 64 is refused by a2a's own path validation before the engine
// is consulted. They are deleted rather than re-pointed, because an assert whose
// premise is wrong does not become right by adjusting its arithmetic. The
// numbers are pinned against the served schema by the tests below instead.

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

    /// PIN every clarification bound to the number a2a actually enforces.
    ///
    /// This is the ONLY place in the repository where these values are stated
    /// as literals, and that is deliberate. Every other check of them - the
    /// engine's boundary tests, the card's cap test - now derives BOTH its
    /// fixture and its expectation from the constant, which is correct for
    /// proving BEHAVIOUR at the boundary and worthless for proving the VALUE:
    /// set the answer cap to a million and every one of those tests still
    /// passes, because input and expectation drift together. That is precisely
    /// how a 4096-char answer cap survived against a sibling that refuses at
    /// 2048.
    ///
    /// So exactly one assertion holds each value against the outside world. The
    /// arbiter is the SERVED contract - `openapi.json` from the gateway the
    /// panel drives - not a reading of any a2a checkout, because two such
    /// readings, taken from two different trees, are what disagreed here. The
    /// module header records the document, the date, and the exact fields.
    ///
    /// What this test CANNOT do, stated so nobody over-trusts it: it does not
    /// fetch that document. A simultaneous change on both sides goes unnoticed
    /// here and is caught only by a round-trip against a running sibling.
    #[test]
    fn the_clarification_bounds_are_pinned_to_the_numbers_a2a_enforces() {
        assert_eq!(
            A2A_MAX_CLARIFICATION_QUESTIONS, 4,
            "a2a's MAX_QUESTIONS_PER_REQUEST bounds ClarificationRequest.questions \
             and ClarificationAnswers.answers at 4"
        );
        assert_eq!(
            A2A_MAX_CLARIFICATION_OPTIONS, 4,
            "a2a's MAX_OPTIONS_PER_QUESTION bounds ClarificationQuestion.options at 4"
        );
        assert_eq!(
            A2A_MAX_CLARIFICATION_ANSWER_CHARS, 4096,
            "the served RunClarificationRespondRequest bounds each answers value at \
             maxLength 4096; refusing short of it rejects an answer a2a would have \
             accepted, and the user cannot tell a local cap from a remote one"
        );
        assert_eq!(
            A2A_MAX_CLARIFICATION_REQUEST_ID_CHARS, 64,
            "the served respond route bounds the request_id PATH parameter at \
             maxLength 64 (pattern ^[A-Za-z0-9_][A-Za-z0-9_-]{{0,63}}$); it is the \
             run_id parameter that takes 128, and admitting a longer request id \
             here only defers the refusal to a2a's own path validation"
        );
        assert_eq!(
            A2A_MAX_CLARIFICATION_IDENTIFIER_CHARS, 64,
            "a2a's MAX_IDENTIFIER_CHARS bounds QuestionId at 64"
        );
    }
}
