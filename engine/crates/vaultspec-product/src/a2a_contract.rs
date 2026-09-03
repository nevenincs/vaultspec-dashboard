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
//     answers.patternProperties.<QuestionId>.maxLength  2048   (answer value)
//     answers.propertyNames.maxLength                     64   (question id)
//     answers.maxProperties                                4
//     path param run_id      maxLength                    128  (+ pattern)
//     path param request_id  NO maxLength, NO pattern
//
// Re-derived 2026-08-01 against the document a2a's `create_app().openapi()`
// serves, which is the standard this header sets and the one that matters: a
// source reading of one a2a tree is not evidence about the tree we serve.
//
// That re-derivation corrected two numbers and one shape, all recorded here
// because the same mistake is easy to repeat. The answer bound was read as
// 4096 under `additionalProperties`; a2a serves 2048 under `patternProperties`
// (the map key carries a pattern, so the keyword differs) - the earlier reading
// came from a tree that is not the one shipped. And `request_id` was recorded
// as bounded at 64 with a pattern; the served route declares it bare
// `{"type": "string"}`. There is no a2a-side path validation of that parameter
// to defer a refusal to, so a bound here that is tighter than what a2a MINTS
// strands the run rather than pre-empting a refusal.

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
/// a2a: the `answers` map's value bound on `RunClarificationRespondRequest` -
/// `patternProperties.<QuestionId>.maxLength: 2048`, which is a2a's
/// `MAX_ANSWER_CHARS`. Characters, not bytes, on both sides.
pub const A2A_MAX_CLARIFICATION_ANSWER_CHARS: usize = 2048;

/// The longest a clarification request id may be.
///
/// a2a: `MAX_REQUEST_ID_CHARS`, the bound on the `ClarificationRequestId` a2a
/// MINTS - not a bound on the served path parameter, which declares none. That
/// is the reading that matters here: the engine's only job with this value is
/// to avoid refusing a handle a2a issued, so it must be at least what a2a can
/// mint. a2a mints `clarify-{thread_id}` truncated to this ceiling.
///
/// Being WIDER than a2a costs nothing (a2a resolves the id against its own
/// parked checkpoint and refuses an unknown one); being NARROWER strands the
/// run, because the handle is unanswerable through this edge while the run
/// stays parked. When in doubt this value goes up, never down.
pub const A2A_MAX_CLARIFICATION_REQUEST_ID_CHARS: usize = 128;

/// The longest a question id may be.
///
/// a2a: `MAX_IDENTIFIER_CHARS`, carried by `QuestionId` - which is also the key
/// type of the `answers` map the engine forwards.
pub const A2A_MAX_CLARIFICATION_IDENTIFIER_CHARS: usize = 64;

/// The closed vocabulary a failed run's provider condition is drawn from.
///
/// A provider can refuse work for reasons a user can act on, and the actions
/// genuinely differ: wait, re-authenticate, top up, raise a spend ceiling,
/// change the request, or report a bug. This is the set of answers to "what
/// should the reader DO about it", and it is the machine-readable counterpart to
/// a failure reason - which is prose for a person and may be reworded by a
/// vendor at any time. Nothing may derive a condition from that prose.
///
/// `unknown` is a real member, not an error case: it is the floor a failure with
/// no resolvable discriminator lands on, and saying so plainly is more useful
/// than promising a classification that was never observed.
///
/// Declared ONCE here for the reason this module exists. a2a resolves the value
/// and serves it; the dashboard models, validates, persists and renders it. Two
/// lists would agree on the day they were written and diverge on the day one of
/// them was edited, at which point a run whose classification a2a resolved
/// correctly would be refused as unrecognised on arrival.
///
/// The producing side treats this vocabulary as ADDITIVE-ONLY: no member's
/// spelling or meaning changes, but a member may be added. An addition there is
/// therefore a required edit HERE - until it lands, a run carrying the new
/// member is refused at the dashboard's write boundary, which is a loud,
/// diagnosable failure by design rather than a silent one.
pub const A2A_PROVIDER_CONDITIONS: &[&str] = &[
    "network_unreachable",
    "provider_overloaded",
    "unauthenticated",
    "throttled",
    "usage_exhausted",
    "credits_exhausted",
    "budget_exhausted",
    "invalid_request",
    "unknown",
];

// Two build-time asserts stood here encoding the relationship that the request
// id must exceed the identifier cap because a2a mints it as
// `clarify-{thread_id}`. They were deleted on the reading that the served route
// bounded `request_id` at 64 independently of `run_id`; the 2026-08-01
// re-derivation shows it declares no bound at all, so the premise for deleting
// them was itself wrong and the minting relationship they encoded was right.
//
// They are NOT restored, for a different and better reason: a build-time assert
// over two constants in this file can only check them against each other, which
// is the identity-check trap this module already fell into twice. Both numbers
// now agree with a2a because a2a's OWN test suite reads this file and compares
// against a2a's constants (`test_engine_edge_bounds_agreement.py`). That gate
// can see a wrong shared number; an assert in here never could.

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
            A2A_MAX_CLARIFICATION_ANSWER_CHARS, 2048,
            "the served RunClarificationRespondRequest bounds each answers value at \
             maxLength 2048 (a2a's MAX_ANSWER_CHARS); admitting more forwards an \
             answer a2a's wire model refuses at 422, and the user cannot tell a \
             local cap from a remote one"
        );
        assert_eq!(
            A2A_MAX_CLARIFICATION_REQUEST_ID_CHARS, 128,
            "the served respond route declares NO bound on the request_id path \
             parameter, so this mirrors what a2a MINTS (MAX_REQUEST_ID_CHARS = \
             128): clarify-{{thread_id}} truncated to 128. A tighter value here \
             refuses a handle a2a issued and leaves the run parked and \
             unanswerable through this edge"
        );
        assert_eq!(
            A2A_MAX_CLARIFICATION_IDENTIFIER_CHARS, 64,
            "a2a's MAX_IDENTIFIER_CHARS bounds QuestionId at 64"
        );
    }

    /// PIN the provider-condition vocabulary to the members a2a actually emits.
    ///
    /// Held against literals for the same reason the clarification bounds are:
    /// every other check of this set - the store's membership validator, its
    /// round-trip coverage - derives both its fixture and its expectation from
    /// the constant, so they would agree with each other whatever it said.
    /// Rename a member here and all of them still pass, while every run
    /// classified as that member starts being refused on arrival.
    ///
    /// The arbiter is a2a's own condition vocabulary, whose values are the wire
    /// form. This test does not fetch it, so a simultaneous edit on both sides
    /// goes unnoticed here and is caught only by a round-trip against a running
    /// sibling.
    #[test]
    fn the_provider_conditions_are_pinned_to_the_members_a2a_emits() {
        assert_eq!(
            A2A_PROVIDER_CONDITIONS,
            [
                "network_unreachable",
                "provider_overloaded",
                "unauthenticated",
                "throttled",
                "usage_exhausted",
                "credits_exhausted",
                "budget_exhausted",
                "invalid_request",
                "unknown",
            ],
            "these are the exact wire spellings the producing side resolves to; \
             a member missing here refuses a run a2a classified correctly, and a \
             member spelled differently is the same defect wearing a typo"
        );
        assert!(
            A2A_PROVIDER_CONDITIONS.contains(&"unknown"),
            "the floor member is what an absent or unrecognised discriminator \
             resolves to upstream; without it every unclassified failure is \
             refused instead of reported"
        );
    }
}
