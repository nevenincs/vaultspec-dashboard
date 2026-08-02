//! Input validation for the a2a pass-through verbs (split from `a2a.rs` under
//! the module-size gate — a move, not a re-decision). Every guard is the same
//! bounded, fail-closed check it was in the flat module.

use super::*;

/// Validate a bounded, path-safe id: non-empty, not flag-shaped, restricted to
/// `[A-Za-z0-9_-]` so it can never carry a path separator, `..`, or shell
/// metacharacter into the URL it is interpolated into.
pub(super) fn validate_path_safe_id(
    state: &AppState,
    field: &str,
    value: &str,
    max: usize,
) -> Result<String, (StatusCode, Json<Value>)> {
    let ok = !value.is_empty()
        && value.len() <= max
        && !value.starts_with('-')
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if !ok {
        return Err(crate::routes::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "`{field}` `{value}` must be a non-empty path-safe token \
                 (letters, digits, `-`, `_`; no leading `-`; <= {max} chars)"
            ),
        ));
    }
    Ok(value.to_string())
}

/// [`validate_path_safe_id`] for the run id that forms `/v1/runs/{run_id}`,
/// length-bounded to the a2a contract's 128-char ceiling.
pub(super) fn validate_run_id(
    state: &AppState,
    run_id: &str,
) -> Result<String, (StatusCode, Json<Value>)> {
    validate_path_safe_id(state, "run_id", run_id, MAX_A2A_RUN_ID_CHARS)
}

/// Validate a bounded free-text field (`title`) capped at `max` chars, rejecting
/// control characters. Optional-value helper: `None` passes through.
pub(super) fn validate_bounded_text(
    state: &AppState,
    field: &str,
    value: &str,
    max: usize,
) -> Result<String, (StatusCode, Json<Value>)> {
    if value.chars().count() > max || value.chars().any(|c| c.is_control()) {
        return Err(crate::routes::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("`{field}` must be <= {max} chars with no control characters"),
        ));
    }
    Ok(value.to_string())
}

/// Validate a bounded token field (`team_preset`, `feature_tag`):
/// non-empty, capped, restricted to the kebab/word/dot/colon grammar the sibling
/// accepts, with no leading `-` (the flag-injection guard).
pub(super) fn validate_bounded_token(
    state: &AppState,
    field: &str,
    value: &str,
    max: usize,
) -> Result<String, (StatusCode, Json<Value>)> {
    let ok = bounded_token_is_valid(value, max);
    if !ok {
        return Err(crate::routes::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "`{field}` `{value}` must be a non-empty token \
                 (letters, digits, `_`, `-`, `.`, `:`; no leading `-`; <= {max} chars)"
            ),
        ));
    }
    Ok(value.to_string())
}

pub(super) fn bounded_token_is_valid(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.chars().count() <= max
        && !value.starts_with('-')
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.' | b':'))
}

/// Validate a provider-issued opaque value without turning it into an engine
/// enum. Catalog entry, revision, provider, execution-mode, and native-control
/// values are not interpolated into a URL or command here, so their provider
/// spelling is retained; only emptiness, control characters, and resource
/// bounds are refused.
pub(super) fn validate_opaque_catalog_value(
    state: &AppState,
    field: &str,
    value: &str,
    max: usize,
) -> Result<(), (StatusCode, Json<Value>)> {
    if value.trim().is_empty() || value.chars().count() > max || value.chars().any(char::is_control)
    {
        return Err(crate::routes::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "`{field}` must be a non-empty printable provider-issued value no longer than {max} chars"
            ),
        ));
    }
    Ok(())
}

/// Validate only the transport-safe shape of a served selection. This boundary
/// cannot and must not decide whether a provider, model entry, control, or role
/// is currently valid: A2A owns catalog membership, provider health, preset
/// role membership, and the durable freeze. The engine independently bounds
/// every map and opaque string before forwarding it.
pub(super) fn validate_catalog_selection_reference(
    state: &AppState,
    field: &str,
    selection: &CatalogSelectionReference,
) -> Result<(), (StatusCode, Json<Value>)> {
    if selection.schema_version != 1 {
        return Err(crate::routes::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("`{field}.schema_version` must be the admitted version 1"),
        ));
    }
    validate_opaque_catalog_value(
        state,
        &format!("{field}.provider_id"),
        &selection.provider_id,
        MAX_A2A_CATALOG_REFERENCE_CHARS,
    )?;
    validate_opaque_catalog_value(
        state,
        &format!("{field}.execution_mode"),
        &selection.execution_mode,
        MAX_A2A_CATALOG_REFERENCE_CHARS,
    )?;
    validate_opaque_catalog_value(
        state,
        &format!("{field}.catalog_revision"),
        &selection.catalog_revision,
        MAX_A2A_CATALOG_REFERENCE_CHARS,
    )?;
    validate_opaque_catalog_value(
        state,
        &format!("{field}.entry_id"),
        &selection.entry_id,
        MAX_A2A_CATALOG_REFERENCE_CHARS,
    )?;
    if selection.controls.len() > MAX_A2A_CONTROLS_PER_SELECTION {
        return Err(crate::routes::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "`{field}.controls` has {} entries; at most {MAX_A2A_CONTROLS_PER_SELECTION} are allowed",
                selection.controls.len()
            ),
        ));
    }
    for (control_id, value) in &selection.controls {
        validate_opaque_catalog_value(
            state,
            &format!("{field}.controls key"),
            control_id,
            MAX_A2A_CONTROL_ID_CHARS,
        )?;
        validate_opaque_catalog_value(
            state,
            &format!("{field}.controls[{control_id}]"),
            value,
            MAX_A2A_CONTROL_VALUE_CHARS,
        )?;
    }
    Ok(())
}

pub(super) fn validate_run_catalog_selection(
    state: &AppState,
    body: &A2aVerbBody,
) -> Result<(), (StatusCode, Json<Value>)> {
    // TRANSITIONAL, optional-until-served (edge-record amendment, 2026-08-02):
    // the sibling does not yet serve `/v1/provider-catalog` or admit
    // `selection` on run-start (its schema is extra-forbid), so a start
    // WITHOUT a selection is the only start the deployed sibling accepts.
    // Absent means absent — the forwarded body carries no selection-shaped
    // key at all, which the sibling's current schema admits unchanged. When
    // the catalog producer lands both halves, requiring the selection again
    // is the recorded SUNSET: a one-line reversal here plus moving the three
    // selection keys into the admitted-keys pin together. Overrides and
    // fallbacks without a selection are refused: they modify a whole-team
    // selection that is not there, and the sibling would refuse the
    // forwarded keys anyway.
    let Some(selection) = body.selection.as_ref() else {
        if body.overrides.is_some() || body.fallbacks.is_some() {
            return Err(crate::routes::api_error(
                state,
                StatusCode::BAD_REQUEST,
                "run-start `overrides`/`fallbacks` require a `selection`".to_string(),
            ));
        }
        return Ok(());
    };
    validate_catalog_selection_reference(state, "selection", selection)?;

    if let Some(overrides) = body.overrides.as_ref() {
        if overrides.len() > MAX_A2A_ROLE_OVERRIDES {
            return Err(crate::routes::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!(
                    "`overrides` has {} roles; at most {MAX_A2A_ROLE_OVERRIDES} are allowed",
                    overrides.len()
                ),
            ));
        }
        for (role_id, override_selection) in overrides {
            validate_bounded_token(state, "overrides role id", role_id, MAX_A2A_ROLE_ID_CHARS)?;
            validate_catalog_selection_reference(
                state,
                &format!("overrides[{role_id}]"),
                override_selection,
            )?;
        }
    }

    if let Some(fallbacks) = body.fallbacks.as_ref() {
        if fallbacks.len() > MAX_A2A_FALLBACKS {
            return Err(crate::routes::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!(
                    "`fallbacks` has {} entries; at most {MAX_A2A_FALLBACKS} are allowed",
                    fallbacks.len()
                ),
            ));
        }
        for (index, fallback) in fallbacks.iter().enumerate() {
            validate_catalog_selection_reference(state, &format!("fallbacks[{index}]"), fallback)?;
        }
    }
    Ok(())
}

/// Fence a scope-sensitive operation against a concurrent workspace switch.
/// The browser may echo the served scope, but it can never choose the forwarded
/// root: equality is checked against the selected cell and only `cell.root` is
/// injected downstream.
pub(super) fn validate_expected_scope(
    state: &AppState,
    cell: &ScopeCell,
    body: &A2aVerbBody,
    verb: &str,
) -> Result<(), (StatusCode, Json<Value>)> {
    let expected = body.expected_scope.as_deref().ok_or_else(|| {
        crate::routes::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("{verb} requires an `expected_scope` generation fence"),
        )
    })?;
    let expected = validate_bounded_text(state, "expected_scope", expected, MAX_A2A_SCOPE_CHARS)?;
    // The browser receives the route token, not the filesystem's raw spelling.
    // On Windows a cold cell may retain a `\\?\` prefix while `scope_token`
    // deliberately serves the canonical drive-path spelling. Compare like with
    // like; the downstream workspace_root remains the engine-owned real root.
    let actual = crate::routes::scope_token(&cell.root);
    if expected != actual {
        return Err(crate::routes::api_error(
            state,
            StatusCode::CONFLICT,
            format!("active scope changed before {verb}; retry against the served scope"),
        ));
    }
    Ok(())
}
