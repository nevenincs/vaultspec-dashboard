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
}

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
    &["Appearance", "Graph"]
}

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
    }
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
        },
        SettingDef {
            key: "default_granularity".to_string(),
            value_type: SettingType::Enum {
                members: vec!["feature".to_string(), "document".to_string()],
            },
            default: "feature".to_string(),
            scope_eligible: true,
            control: ControlKind::Segmented,
            label: "Default granularity".to_string(),
            description: "The graph detail level on load.".to_string(),
            group: "Graph".to_string(),
            order: 1,
            step: None,
            unit: None,
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
        // Integer support is exercised at the type level (no integer setting is
        // currently in the registry; the slider control awaits a consuming
        // setting). `check_value` is the pure validator the registry path wraps.
        let ty = SettingType::Integer { min: 50, max: 200 };
        assert_eq!(check_value(&ty, "120").unwrap(), "120");
        assert!(check_value(&ty, "9999").is_err());
        assert!(check_value(&ty, "1.5").is_err());
        assert!(check_value(&ty, "").is_err());
        assert!(check_value(&ty, " 80").is_err());
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
}
