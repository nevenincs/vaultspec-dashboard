//! The settings schema registry: the single source of truth for every
//! user/application setting (dashboard-settings ADR).
//!
//! Each setting is declared ONCE here — its key, value type and constraints,
//! default, scope-eligibility, and the UI hint that tells the client which
//! control to render. That one declaration drives three things:
//!
//! - validation on `PUT /settings` (an unknown key or an out-of-constraint
//!   value is a typed rejection, not a silent accept);
//! - the served schema (`GET /settings/schema`), which the client reads to
//!   render controls and synthesize defaults;
//! - the client's effective-value resolution (scoped-then-global, falling back
//!   to the declared default).
//!
//! The wire stays string-valued: values persist and serve as strings through
//! the existing `settings(scope, key, value)` table and the `{global, scoped}`
//! envelope. Typing is a SCHEMA concern applied on both ends — booleans ride as
//! `"true"`/`"false"`, integers as decimal strings — so this layer adds typed
//! meaning without a storage migration. Like the rest of the crate, nothing
//! here writes `.vault/` or git (the read-and-infer fence).

use serde::Serialize;

/// A setting's value type and its constraints. Drives validation and tells the
/// client how to decode the string-valued wire form. Serializes tagged, e.g.
/// `{"type":"enum","members":[...]}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SettingType {
    /// One of a fixed set of string members.
    Enum { members: Vec<String> },
    /// A boolean, wire-encoded as `"true"` / `"false"`.
    Bool,
    /// Free text of at most `max_len` bytes.
    String { max_len: usize },
    /// An integer in the inclusive range `[min, max]`, wire-encoded as a
    /// decimal string.
    Integer { min: i64, max: i64 },
    /// A sparse keyboard-binding OVERRIDE map, wire-encoded as a JSON object
    /// string `{action_id: chord}`. The engine validates structure and bounds
    /// the map at `max_entries` (bounded-by-default) but does NOT own the chord
    /// grammar: the frontend keybinding registry is the authority for which
    /// action ids exist and the canonical chord form, and it tolerates a corrupt
    /// or unknown entry by falling back to the default. So the engine's job is to
    /// keep the persisted value well-formed and bounded, not to parse chords.
    Keybindings { max_entries: usize },
    /// A sparse GRAPH-CONTROL override map, wire-encoded as a JSON object string
    /// `{control_id: value}` where each value is a JSON number or string. Exactly
    /// the keybindings boundary applied to the graph's force/appearance tuning:
    /// the engine validates structure (object of number|string values) and bounds
    /// the map at `max_entries` (bounded-by-default), but does NOT own the control
    /// vocabulary — the frontend `graphControlSchema` is the authority for which
    /// control ids exist and their ranges/semantics, and it resolves schema
    /// defaults for any absent or unknown id. So the engine's job is to keep the
    /// persisted value well-formed and bounded, not to know the controls.
    GraphControls { max_entries: usize },
    /// A sparse SECTION-FOLD map: which collapsible UI sections the user keeps
    /// OPEN, wire-encoded as a JSON object string `{section_id: open_bool}`. The
    /// same bounded, frontend-owned-vocabulary map boundary as `Keybindings` /
    /// `GraphControls`, applied to per-section disclosure/fold state (e.g. the
    /// activity rail's sections): the engine validates structure (an object of
    /// booleans) and bounds the map at `max_entries` (bounded-by-default), but
    /// does NOT own the section vocabulary — the frontend owns which section ids
    /// exist and each section's default open/closed, falling back to that default
    /// for any absent or unknown id. So the engine's job is to keep the persisted
    /// value well-formed and bounded, not to know the sections.
    SectionFolds { max_entries: usize },
}

/// Per-chord byte ceiling inside a keybindings override map. A generous bound
/// that rejects garbage while admitting any real chord string.
const KEYBINDING_CHORD_MAX_LEN: usize = 64;

/// Per-value byte ceiling for a string-valued graph-control override. A generous
/// bound that rejects garbage while admitting any real control value (e.g. a
/// gradient-mode enum string); numeric values are not length-bound.
const GRAPH_CONTROL_VALUE_MAX_LEN: usize = 64;

/// The UI control a setting renders as (the schema-driven render hint). Adding
/// a new control kind is the one place the client and this enum must agree.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ControlKind {
    /// A segmented single-select for a small enum.
    Segmented,
    /// A binary on/off switch for a boolean.
    Switch,
    /// A single-line text field for a string.
    Text,
    /// A slider for a bounded integer.
    Slider,
    /// The keybinding editor: renders the frontend registry's action catalog as
    /// per-action chord recorders and writes back the sparse override map.
    Keybinding,
    /// The graph-controls override map. Surfaced and edited from the graph
    /// controls overlay panel (the bespoke force/appearance tuning surface), not
    /// the settings dialog — the dialog skips this control kind. The value is the
    /// sparse `control_id -> value` override map the overlay writes back.
    GraphControls,
    /// A section-fold map. Persisted programmatically by the surface that owns the
    /// collapsible sections (the activity rail), NOT edited in the settings dialog
    /// — the dialog skips this control kind. The value is the sparse
    /// `section_id -> open` map the surface writes back.
    SectionFolds,
}

/// One declared setting. Owned (not `&'static`) so the registry can carry enum
/// members; built once and cached.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SettingDef {
    /// The stable wire key (identity-bearing; never reused for another meaning).
    pub key: String,
    pub value_type: SettingType,
    /// The default wire value (string form) used when no row exists.
    pub default: String,
    /// Whether a per-scope override is allowed. `false` = global only.
    pub scope_eligible: bool,
    pub control: ControlKind,
    /// Operator-facing label.
    pub label: String,
    /// One-line description shown under the control.
    pub description: String,
    /// The category the setting groups under in the dialog.
    pub group: String,
    /// Sort order within the group (ascending).
    pub order: u32,
    /// Slider step (slider controls only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<i64>,
    /// A unit suffix for display, e.g. `"%"` (slider controls only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    /// Placeholder hint for an empty field (text controls only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
}

/// Why a settings write was rejected. Maps to a machine-readable `error_kind`
/// on the wire so the client distinguishes a bad write from a backend tier
/// being down.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationError {
    /// The key is not declared in the registry.
    UnknownKey(String),
    /// The key is declared global-only but a scope override was attempted.
    ScopeNotAllowed(String),
    /// The value violates the declared type or constraint.
    InvalidValue { key: String, reason: String },
}

impl ValidationError {
    /// The stable machine-readable kind for the error envelope.
    pub fn kind(&self) -> &'static str {
        match self {
            ValidationError::UnknownKey(_) => "unknown_key",
            ValidationError::ScopeNotAllowed(_) => "scope_not_allowed",
            ValidationError::InvalidValue { .. } => "invalid_value",
        }
    }

    /// A human-facing message (client-safe — names only the key and the rule).
    pub fn message(&self) -> String {
        match self {
            ValidationError::UnknownKey(key) => {
                format!("unknown setting key `{key}`")
            }
            ValidationError::ScopeNotAllowed(key) => {
                format!("setting `{key}` is global-only and cannot be scoped")
            }
            ValidationError::InvalidValue { key, reason } => {
                format!("invalid value for `{key}`: {reason}")
            }
        }
    }
}

/// The settings registry, built once and cached. The single source of truth.
pub fn registry() -> &'static [SettingDef] {
    static REGISTRY: std::sync::OnceLock<Vec<SettingDef>> = std::sync::OnceLock::new();
    REGISTRY.get_or_init(build_registry)
}

/// The display order of the setting groups (engine-owned so the dialog's
/// section order is part of the contract, not a client guess).
pub fn groups() -> &'static [&'static str] {
    &["Appearance", "Graph", "Keybindings"]
}

/// The cap on user keybinding overrides, mirrored by the frontend registry's
/// `MAX_KEYBINDING_OVERRIDES`. Bounded-by-default: the persisted map can never
/// grow without limit.
pub const MAX_KEYBINDING_OVERRIDES: usize = 256;

/// The cap on user graph-control overrides, mirrored by the frontend graph
/// controls schema. Bounded-by-default: the persisted map can never grow without
/// limit. Sized generously above the real force/appearance control count.
pub const MAX_GRAPH_CONTROL_OVERRIDES: usize = 256;

/// The cap on persisted section-fold entries (bounded-by-default). Sized
/// generously above the real collapsible-section count of any one rail.
pub const MAX_SECTION_FOLDS: usize = 64;

/// Look up a declared setting by key.
pub fn find(key: &str) -> Option<&'static SettingDef> {
    registry().iter().find(|d| d.key == key)
}

/// Validate a write of `value` to `key`, `scoped` when a per-scope override is
/// being set. On success returns the CANONICAL stored string (so callers
/// persist a normalized form, e.g. a trimmed integer). On failure returns a
/// typed [`ValidationError`].
pub fn validate(key: &str, value: &str, scoped: bool) -> Result<String, ValidationError> {
    let def = find(key).ok_or_else(|| ValidationError::UnknownKey(key.to_string()))?;
    if scoped && !def.scope_eligible {
        return Err(ValidationError::ScopeNotAllowed(key.to_string()));
    }
    check_value(&def.value_type, value).map_err(|reason| invalid(key, reason))
}

/// The pure type-level check: validate `value` against a [`SettingType`]'s
/// constraint, returning the CANONICAL stored string on success or a
/// human-facing reason on failure. The registry-aware [`validate`] wraps this
/// after the key lookup + scope check; kept separate so each value type is
/// unit-testable without a registry entry.
pub fn check_value(value_type: &SettingType, value: &str) -> Result<String, String> {
    match value_type {
        SettingType::Enum { members } => {
            if members.iter().any(|m| m == value) {
                Ok(value.to_string())
            } else {
                Err(format!("must be one of: {}", members.join(", ")))
            }
        }
        SettingType::Bool => match value {
            "true" | "false" => Ok(value.to_string()),
            _ => Err("must be \"true\" or \"false\"".to_string()),
        },
        SettingType::String { max_len } => {
            if value.len() <= *max_len {
                Ok(value.to_string())
            } else {
                Err(format!("must be at most {max_len} characters"))
            }
        }
        SettingType::Integer { min, max } => match value.parse::<i64>() {
            Ok(n) if n >= *min && n <= *max => Ok(n.to_string()),
            Ok(_) => Err(format!("must be between {min} and {max}")),
            Err(_) => Err("must be an integer".to_string()),
        },
        SettingType::Keybindings { max_entries } => check_keybindings(value, *max_entries),
        SettingType::GraphControls { max_entries } => check_graph_controls(value, *max_entries),
        SettingType::SectionFolds { max_entries } => check_section_folds(value, *max_entries),
    }
}

/// Validate a keybindings override map: a JSON object of `action_id -> chord`
/// strings, bounded at `max_entries`, with each id and chord non-empty and each
/// chord at most [`KEYBINDING_CHORD_MAX_LEN`] bytes. Returns the CANONICAL form
/// (compact JSON with sorted keys) so storage is normalized regardless of the
/// client's key order or whitespace. The chord grammar itself is the frontend's
/// authority - this only keeps the persisted value well-formed and bounded.
fn check_keybindings(value: &str, max_entries: usize) -> Result<String, String> {
    use std::collections::BTreeMap;
    let map: BTreeMap<String, String> = serde_json::from_str(value)
        .map_err(|_| "must be a JSON object of action-id to chord strings".to_string())?;
    if map.len() > max_entries {
        return Err(format!("at most {max_entries} bindings may be overridden"));
    }
    // Normalize each chord to its trimmed form so the stored value never carries
    // insignificant leading/trailing whitespace (M2). The length bound is a byte
    // ceiling on the trimmed chord.
    let mut normalized: BTreeMap<String, String> = BTreeMap::new();
    for (id, chord) in map {
        if id.is_empty() {
            return Err("a binding id must not be empty".to_string());
        }
        let trimmed = chord.trim();
        if trimmed.is_empty() {
            return Err(format!("binding `{id}` has an empty chord"));
        }
        if trimmed.len() > KEYBINDING_CHORD_MAX_LEN {
            return Err(format!(
                "binding `{id}` chord exceeds {KEYBINDING_CHORD_MAX_LEN} bytes"
            ));
        }
        normalized.insert(id, trimmed.to_string());
    }
    // BTreeMap re-serializes with sorted keys and no insignificant whitespace.
    serde_json::to_string(&normalized).map_err(|_| "could not normalize bindings".to_string())
}

/// Validate a graph-controls override map: a JSON object of `control_id -> value`
/// where each value is a JSON number or string, bounded at `max_entries`, with
/// each id non-empty and each string value trimmed, non-empty, and at most
/// [`GRAPH_CONTROL_VALUE_MAX_LEN`] bytes. Returns the CANONICAL form (compact
/// JSON with sorted keys) so storage is normalized regardless of the client's
/// key order or whitespace. The control vocabulary and numeric ranges are the
/// frontend's authority — this only keeps the persisted value well-formed,
/// type-restricted (number|string), and bounded.
fn check_graph_controls(value: &str, max_entries: usize) -> Result<String, String> {
    use serde_json::Value;
    use std::collections::BTreeMap;
    let map: BTreeMap<String, Value> = serde_json::from_str(value).map_err(|_| {
        "must be a JSON object of control-id to number-or-string values".to_string()
    })?;
    if map.len() > max_entries {
        return Err(format!("at most {max_entries} controls may be overridden"));
    }
    let mut normalized: BTreeMap<String, Value> = BTreeMap::new();
    for (id, val) in map {
        if id.is_empty() {
            return Err("a control id must not be empty".to_string());
        }
        let canonical = match val {
            Value::Number(n) => Value::Number(n),
            Value::String(s) => {
                let trimmed = s.trim();
                if trimmed.is_empty() {
                    return Err(format!("control `{id}` has an empty value"));
                }
                if trimmed.len() > GRAPH_CONTROL_VALUE_MAX_LEN {
                    return Err(format!(
                        "control `{id}` value exceeds {GRAPH_CONTROL_VALUE_MAX_LEN} bytes"
                    ));
                }
                Value::String(trimmed.to_string())
            }
            _ => {
                return Err(format!("control `{id}` value must be a number or string"));
            }
        };
        normalized.insert(id, canonical);
    }
    // BTreeMap re-serializes with sorted keys and no insignificant whitespace.
    serde_json::to_string(&normalized).map_err(|_| "could not normalize controls".to_string())
}

/// Validate a section-fold map: a JSON object of `section_id -> open` booleans,
/// bounded at `max_entries`, each id non-empty. Returns the CANONICAL form
/// (compact JSON, sorted keys) so storage is normalized regardless of the
/// client's key order or whitespace. The section vocabulary and each section's
/// default open/closed are the frontend's authority — this only keeps the
/// persisted value well-formed (an object of booleans) and bounded.
fn check_section_folds(value: &str, max_entries: usize) -> Result<String, String> {
    use std::collections::BTreeMap;
    let map: BTreeMap<String, bool> = serde_json::from_str(value)
        .map_err(|_| "must be a JSON object of section-id to open booleans".to_string())?;
    if map.len() > max_entries {
        return Err(format!(
            "at most {max_entries} section folds may be persisted"
        ));
    }
    if map.keys().any(|id| id.is_empty()) {
        return Err("a section id must not be empty".to_string());
    }
    // BTreeMap re-serializes with sorted keys and no insignificant whitespace.
    serde_json::to_string(&map).map_err(|_| "could not normalize section folds".to_string())
}

fn invalid(key: &str, reason: String) -> ValidationError {
    ValidationError::InvalidValue {
        key: key.to_string(),
        reason,
    }
}

fn build_registry() -> Vec<SettingDef> {
    vec![
        SettingDef {
            key: "theme".to_string(),
            value_type: SettingType::Enum {
                members: vec![
                    "system".to_string(),
                    "light".to_string(),
                    "dark".to_string(),
                    "high-contrast".to_string(),
                ],
            },
            default: "system".to_string(),
            scope_eligible: false,
            control: ControlKind::Segmented,
            label: "Theme".to_string(),
            description: "The dashboard color theme.".to_string(),
            group: "Appearance".to_string(),
            order: 1,
            step: None,
            unit: None,
            placeholder: None,
        },
        SettingDef {
            key: "reduce_motion".to_string(),
            value_type: SettingType::Bool,
            default: "false".to_string(),
            scope_eligible: false,
            control: ControlKind::Switch,
            label: "Reduce motion".to_string(),
            description: "Minimise animation and transitions.".to_string(),
            group: "Appearance".to_string(),
            order: 2,
            step: None,
            unit: None,
            placeholder: None,
        },
        // The activity-rail collapsible-section OPEN state — the user's per-section
        // fold preference, persisted as GLOBAL UX state the rail reads on load and
        // writes on toggle (settings-are-schema-driven-from-one-registry; the
        // DURABLE settings table, NOT localStorage and NOT the volatile
        // dashboard-state). A bounded `{section_id: open}` map; the frontend owns
        // the section vocabulary and each section's default (collapsed) for any
        // absent id, so the engine just keeps it well-formed + bounded. Written
        // programmatically by the rail, so the settings dialog skips this control.
        SettingDef {
            key: "right_rail_section_folds".to_string(),
            value_type: SettingType::SectionFolds {
                max_entries: MAX_SECTION_FOLDS,
            },
            default: "{}".to_string(),
            scope_eligible: false,
            control: ControlKind::SectionFolds,
            label: "Activity rail section folds".to_string(),
            description: "Which activity-rail sections are kept open.".to_string(),
            group: "Appearance".to_string(),
            order: 3,
            step: None,
            unit: None,
            placeholder: None,
        },
        SettingDef {
            key: "default_granularity".to_string(),
            value_type: SettingType::Enum {
                members: vec!["feature".to_string(), "document".to_string()],
            },
            // The DOCUMENT graph is the headline view: real documents coloured by
            // type. The feature constellation collapses every node to one type
            // (`feature`) and one colour, so it is no longer the default (it stays
            // reachable via the granularity toggle / feature descent).
            default: "document".to_string(),
            scope_eligible: true,
            control: ControlKind::Segmented,
            label: "Default granularity".to_string(),
            description: "The graph detail level on load.".to_string(),
            group: "Graph".to_string(),
            order: 1,
            step: None,
            unit: None,
            placeholder: None,
        },
        // The active graph corpus / view mode (codebase-graphing ADR D7): the
        // WHOLE graph surface renders either the VAULT knowledge graph (the
        // default) or the disconnected CODE graph. Durable, user-settings-backed,
        // per-scope (a worktree remembers its last view mode); the left-rail
        // toggle writes it, a settings-effect seeds the live dashboard-state
        // `corpus` field from it, and the corpus swap re-queries + reloads the
        // canvas. Segmented enum like `default_granularity`.
        SettingDef {
            key: "graph_corpus".to_string(),
            value_type: SettingType::Enum {
                members: vec!["vault".to_string(), "code".to_string()],
            },
            default: "vault".to_string(),
            scope_eligible: true,
            control: ControlKind::Segmented,
            label: "Graph corpus".to_string(),
            description: "Which dataset the graph maps: the vault or the codebase.".to_string(),
            group: "Graph".to_string(),
            order: 2,
            step: None,
            unit: None,
            placeholder: None,
        },
        // The date criterion the timeline orders and filters documents by. Three
        // served criteria (the engine derives `dates.{created,modified,stamped}`):
        // `created` (frontmatter `date:`, the safe default present on every view),
        // `modified` (worktree mtime — absent on historical/as-of views), and
        // `stamped` (frontmatter `modified:` CLI stamp). The frontend maps each
        // token to a plain user-facing label; the engine serves the raw tokens.
        SettingDef {
            key: "timeline_date_criterion".to_string(),
            value_type: SettingType::Enum {
                members: vec![
                    "created".to_string(),
                    "modified".to_string(),
                    "stamped".to_string(),
                ],
            },
            default: "created".to_string(),
            scope_eligible: true,
            control: ControlKind::Segmented,
            label: "Timeline date".to_string(),
            description: "Which date the timeline orders and filters documents by.".to_string(),
            group: "Graph".to_string(),
            order: 6,
            step: None,
            unit: None,
            placeholder: None,
        },
        // The inferred-edge certainty floor, declared as a percent (0..100) so it
        // renders as a `%` slider; the client maps the percent to the 0..1 float
        // its per-tier confidence floors use. Global-only: it is the persisted
        // default the Stage's live per-tier confidence sliders initialize from
        // ("Using the global value." in the dialog, with no per-scope override).
        SettingDef {
            key: "confidence_floor".to_string(),
            value_type: SettingType::Integer { min: 0, max: 100 },
            default: "0".to_string(),
            scope_eligible: false,
            control: ControlKind::Slider,
            label: "Confidence floor".to_string(),
            description: "Hide inferred edges below this certainty.".to_string(),
            group: "Graph".to_string(),
            order: 3,
            step: Some(1),
            unit: Some("%".to_string()),
            placeholder: None,
        },
        // The node-stem text filter's persisted default: the Stage's text/stem
        // match initializes from this on scope load. Global, with a default ("");
        // the dialog shows "Using the default.".
        SettingDef {
            key: "label_filter".to_string(),
            value_type: SettingType::String { max_len: 200 },
            default: String::new(),
            scope_eligible: false,
            control: ControlKind::Text,
            label: "Label filter".to_string(),
            description: "Only show nodes whose stem matches.".to_string(),
            group: "Graph".to_string(),
            order: 4,
            step: None,
            unit: None,
            placeholder: Some("type a stem…".to_string()),
        },
        // The user's graph force/appearance tuning overrides: a sparse
        // `control_id -> value` (number|string) map layered over the frontend
        // `graphControlSchema` defaults. One honest, consumed setting — the graph
        // controls overlay panel resolves and writes it (NOT the settings dialog,
        // which skips the GraphControls control kind). Global (one graph look
        // across all workspaces, like theme/keybindings); `frozen` is deliberately
        // EXCLUDED — a transient layout pause, never a persisted preference.
        // Bounded at MAX_GRAPH_CONTROL_OVERRIDES.
        SettingDef {
            key: "graph_controls".to_string(),
            value_type: SettingType::GraphControls {
                max_entries: MAX_GRAPH_CONTROL_OVERRIDES,
            },
            default: "{}".to_string(),
            scope_eligible: false,
            control: ControlKind::GraphControls,
            label: "Graph controls".to_string(),
            description: "Persisted force and appearance tuning for the graph.".to_string(),
            group: "Graph".to_string(),
            order: 5,
            step: None,
            unit: None,
            placeholder: None,
        },
        // The user's keyboard-shortcut overrides: a sparse `action_id -> chord`
        // map layered over the frontend keybinding registry's defaults. One
        // honest setting consumed by the keymap dispatcher (no dead control); the
        // dedicated `Keybinding` control renders the catalog as chord recorders.
        // Bounded at MAX_KEYBINDING_OVERRIDES; global (shortcuts are not scoped).
        SettingDef {
            key: "keybindings".to_string(),
            value_type: SettingType::Keybindings {
                max_entries: MAX_KEYBINDING_OVERRIDES,
            },
            default: "{}".to_string(),
            scope_eligible: false,
            control: ControlKind::Keybinding,
            label: "Keyboard shortcuts".to_string(),
            description: "Customize the chord for any command.".to_string(),
            group: "Keybindings".to_string(),
            order: 1,
            step: None,
            unit: None,
            placeholder: None,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_is_nonempty_and_keys_unique() {
        let reg = registry();
        assert!(!reg.is_empty());
        let mut keys: Vec<&str> = reg.iter().map(|d| d.key.as_str()).collect();
        keys.sort_unstable();
        let len = keys.len();
        keys.dedup();
        assert_eq!(keys.len(), len, "every setting key is unique");
    }

    #[test]
    fn every_default_validates_against_its_own_type() {
        for def in registry() {
            assert!(
                validate(&def.key, &def.default, false).is_ok(),
                "default for `{}` must satisfy its own constraint",
                def.key
            );
        }
    }

    #[test]
    fn unknown_key_is_typed_rejected() {
        let err = validate("not_a_setting", "x", false).unwrap_err();
        assert_eq!(err.kind(), "unknown_key");
    }

    #[test]
    fn enum_membership_is_enforced() {
        assert!(validate("theme", "dark", false).is_ok());
        let err = validate("theme", "chartreuse", false).unwrap_err();
        assert_eq!(err.kind(), "invalid_value");
    }

    #[test]
    fn bool_accepts_only_canonical_forms() {
        assert!(validate("reduce_motion", "true", false).is_ok());
        assert!(validate("reduce_motion", "false", false).is_ok());
        assert_eq!(
            validate("reduce_motion", "yes", false).unwrap_err().kind(),
            "invalid_value"
        );
    }

    #[test]
    fn integer_range_and_canonical_form() {
        // `check_value` is the pure validator the registry path wraps.
        let ty = SettingType::Integer { min: 50, max: 200 };
        assert_eq!(check_value(&ty, "120").unwrap(), "120");
        assert!(check_value(&ty, "9999").is_err());
        assert!(check_value(&ty, "1.5").is_err());
        assert!(check_value(&ty, "").is_err());
        assert!(check_value(&ty, " 80").is_err());
    }

    #[test]
    fn confidence_floor_is_a_percent_slider_global_only() {
        let def = find("confidence_floor").expect("confidence_floor is declared");
        assert_eq!(def.value_type, SettingType::Integer { min: 0, max: 100 });
        assert_eq!(def.control, ControlKind::Slider);
        assert_eq!(def.unit.as_deref(), Some("%"));
        assert_eq!(def.group, "Graph");
        assert!(!def.scope_eligible, "confidence_floor is global-only");
        // In range accepted, out of range rejected, scope rejected.
        assert!(validate("confidence_floor", "60", false).is_ok());
        assert!(validate("confidence_floor", "0", false).is_ok());
        assert!(validate("confidence_floor", "100", false).is_ok());
        assert_eq!(
            validate("confidence_floor", "101", false)
                .unwrap_err()
                .kind(),
            "invalid_value"
        );
        assert_eq!(
            validate("confidence_floor", "60", true).unwrap_err().kind(),
            "scope_not_allowed"
        );
    }

    #[test]
    fn label_filter_is_a_text_string_global() {
        let def = find("label_filter").expect("label_filter is declared");
        assert_eq!(def.control, ControlKind::Text);
        assert!(matches!(def.value_type, SettingType::String { .. }));
        assert_eq!(def.default, "");
        assert!(!def.scope_eligible, "label_filter is global");
        assert!(validate("label_filter", "", false).is_ok());
        assert!(validate("label_filter", "adr", false).is_ok());
        let long = "x".repeat(201);
        assert_eq!(
            validate("label_filter", &long, false).unwrap_err().kind(),
            "invalid_value"
        );
    }

    #[test]
    fn global_only_setting_rejects_a_scope() {
        // theme is global-only.
        let err = validate("theme", "dark", true).unwrap_err();
        assert_eq!(err.kind(), "scope_not_allowed");
    }

    #[test]
    fn scope_eligible_setting_accepts_both() {
        assert!(validate("default_granularity", "document", true).is_ok());
        assert!(validate("default_granularity", "document", false).is_ok());
    }

    #[test]
    fn keybindings_is_declared_global_with_the_keybinding_control() {
        let def = find("keybindings").expect("keybindings is declared");
        assert!(matches!(
            def.value_type,
            SettingType::Keybindings { max_entries } if max_entries == MAX_KEYBINDING_OVERRIDES
        ));
        assert_eq!(def.control, ControlKind::Keybinding);
        assert_eq!(def.group, "Keybindings");
        assert_eq!(def.default, "{}");
        assert!(!def.scope_eligible, "shortcuts are not scoped");
        // The declared default validates against its own type.
        assert!(validate("keybindings", "{}", false).is_ok());
        // And it is offered as a group so the dialog renders it.
        assert!(groups().contains(&"Keybindings"));
    }

    #[test]
    fn keybindings_accepts_a_well_formed_map_and_normalizes_it() {
        let ty = SettingType::Keybindings { max_entries: 8 };
        // Re-serialized canonical: sorted keys, no insignificant whitespace.
        assert_eq!(
            check_value(&ty, "{ \"palette\": \"Mod+K\", \"graph.open\": \"Enter\" }").unwrap(),
            "{\"graph.open\":\"Enter\",\"palette\":\"Mod+K\"}"
        );
        assert_eq!(check_value(&ty, "{}").unwrap(), "{}");
        // M2: chord values are trimmed in the stored canonical form.
        assert_eq!(
            check_value(&ty, "{\"palette\":\"  Mod+K  \"}").unwrap(),
            "{\"palette\":\"Mod+K\"}"
        );
    }

    #[test]
    fn keybindings_rejects_malformed_oversized_or_empty_entries() {
        let ty = SettingType::Keybindings { max_entries: 2 };
        // Not an object of strings.
        assert!(check_value(&ty, "not json").is_err());
        assert!(check_value(&ty, "[\"Mod+K\"]").is_err());
        assert!(check_value(&ty, "{\"a\": 1}").is_err());
        // Over the entry cap.
        assert!(check_value(&ty, "{\"a\":\"Mod+A\",\"b\":\"Mod+B\",\"c\":\"Mod+C\"}").is_err());
        // Empty chord.
        assert!(check_value(&ty, "{\"a\":\"\"}").is_err());
        assert!(check_value(&ty, "{\"a\":\"   \"}").is_err());
        // Over-long chord.
        let long = "x".repeat(KEYBINDING_CHORD_MAX_LEN + 1);
        assert!(check_value(&ty, &format!("{{\"a\":\"{long}\"}}")).is_err());
    }

    #[test]
    fn keybindings_is_global_only() {
        assert_eq!(
            validate("keybindings", "{}", true).unwrap_err().kind(),
            "scope_not_allowed"
        );
    }

    #[test]
    fn graph_controls_is_declared_global_with_the_graph_controls_control() {
        let def = find("graph_controls").expect("graph_controls is declared");
        assert!(matches!(
            def.value_type,
            SettingType::GraphControls { max_entries } if max_entries == MAX_GRAPH_CONTROL_OVERRIDES
        ));
        assert_eq!(def.control, ControlKind::GraphControls);
        assert_eq!(def.group, "Graph");
        assert_eq!(def.default, "{}");
        assert!(!def.scope_eligible, "graph look is global, not scoped");
        // The declared default validates against its own type.
        assert!(validate("graph_controls", "{}", false).is_ok());
    }

    #[test]
    fn graph_controls_accepts_numbers_and_strings_and_normalizes() {
        let ty = SettingType::GraphControls { max_entries: 16 };
        // Re-serialized canonical: sorted keys, no insignificant whitespace,
        // mixed number + string values preserved by JSON type.
        assert_eq!(
            check_value(&ty, "{ \"charge\": -30, \"gradientMode\": \"tier\" }").unwrap(),
            "{\"charge\":-30,\"gradientMode\":\"tier\"}"
        );
        assert_eq!(check_value(&ty, "{}").unwrap(), "{}");
        // Float values are preserved.
        assert_eq!(
            check_value(&ty, "{\"linkStrength\":0.5}").unwrap(),
            "{\"linkStrength\":0.5}"
        );
        // String values are trimmed in the stored canonical form.
        assert_eq!(
            check_value(&ty, "{\"gradientMode\":\"  tier  \"}").unwrap(),
            "{\"gradientMode\":\"tier\"}"
        );
    }

    #[test]
    fn graph_controls_rejects_malformed_oversized_or_wrong_typed_entries() {
        let ty = SettingType::GraphControls { max_entries: 2 };
        // Not an object of number|string.
        assert!(check_value(&ty, "not json").is_err());
        assert!(check_value(&ty, "[1, 2]").is_err());
        // Disallowed value types: bool, null, nested object/array.
        assert!(check_value(&ty, "{\"a\": true}").is_err());
        assert!(check_value(&ty, "{\"a\": null}").is_err());
        assert!(check_value(&ty, "{\"a\": {\"b\": 1}}").is_err());
        assert!(check_value(&ty, "{\"a\": [1]}").is_err());
        // Over the entry cap.
        assert!(check_value(&ty, "{\"a\":1,\"b\":2,\"c\":3}").is_err());
        // Empty string value.
        assert!(check_value(&ty, "{\"a\":\"\"}").is_err());
        assert!(check_value(&ty, "{\"a\":\"   \"}").is_err());
        // Over-long string value.
        let long = "x".repeat(GRAPH_CONTROL_VALUE_MAX_LEN + 1);
        assert!(check_value(&ty, &format!("{{\"a\":\"{long}\"}}")).is_err());
    }

    #[test]
    fn graph_controls_is_global_only() {
        assert_eq!(
            validate("graph_controls", "{}", true).unwrap_err().kind(),
            "scope_not_allowed"
        );
    }

    #[test]
    fn section_folds_is_declared_global_with_the_section_folds_control() {
        // #41: the activity-rail fold state is a declared GLOBAL setting in the one
        // registry (settings-are-schema-driven), served + validated like every
        // other — not localStorage. ControlKind::SectionFolds (dialog-skipped).
        let def = find("right_rail_section_folds").expect("section-folds setting declared");
        assert!(matches!(
            def.value_type,
            SettingType::SectionFolds { max_entries } if max_entries == MAX_SECTION_FOLDS
        ));
        assert_eq!(def.control, ControlKind::SectionFolds);
        assert!(!def.scope_eligible, "fold state is global UX state");
        assert_eq!(def.default, "{}", "no sections recorded by default");
    }

    #[test]
    fn section_folds_accepts_a_bool_map_and_normalizes_sorted() {
        let ty = SettingType::SectionFolds { max_entries: 16 };
        assert_eq!(check_value(&ty, "{}").unwrap(), "{}");
        // Sorted keys, no insignificant whitespace; booleans preserved.
        assert_eq!(
            check_value(&ty, "{ \"plans\": true, \"changes\": false }").unwrap(),
            "{\"changes\":false,\"plans\":true}"
        );
    }

    #[test]
    fn section_folds_rejects_malformed_non_bool_oversized_or_empty_id() {
        let ty = SettingType::SectionFolds { max_entries: 2 };
        assert!(check_value(&ty, "not json").is_err());
        assert!(check_value(&ty, "[true]").is_err());
        // Non-bool values are rejected (object of booleans only).
        assert!(check_value(&ty, "{\"a\": 1}").is_err());
        assert!(check_value(&ty, "{\"a\": \"yes\"}").is_err());
        assert!(check_value(&ty, "{\"a\": null}").is_err());
        // Over the entry cap.
        assert!(check_value(&ty, "{\"a\":true,\"b\":false,\"c\":true}").is_err());
        // Empty section id.
        assert!(check_value(&ty, "{\"\":true}").is_err());
    }

    #[test]
    fn section_folds_is_global_only() {
        assert_eq!(
            validate("right_rail_section_folds", "{}", true)
                .unwrap_err()
                .kind(),
            "scope_not_allowed"
        );
    }
}
