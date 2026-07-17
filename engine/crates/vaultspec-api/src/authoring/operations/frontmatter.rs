//! Frontmatter block read/rewrite/compare helpers for authoring operations.

use super::*;

/// Build the `EditFrontmatter` whole-document PREVIEW: surgically rewrite only
/// the named fields (`date`/`tags`/`related`) in `text`'s frontmatter block,
/// carrying every other line — the body, every untouched frontmatter field —
/// over byte-for-byte. Mirrors the `SetFrontmatter` core capability's own
/// contract ("edit selected frontmatter fields, keeping the body byte-for-byte");
/// it is a PREVIEW for review/validation/fail-closed post-verify, never the
/// authoritative write (the core adapter performs the real write at apply time).
pub(super) fn rewrite_frontmatter_fields(
    child_key: &str,
    text: &str,
    fields: &FrontmatterEditFields,
) -> Result<String> {
    let lines: Vec<&str> = text.split('\n').collect();
    let Some((start, close_index)) = frontmatter_block_range(&lines) else {
        return Err(OperationError::MissingFrontmatterBlock {
            child_key: child_key.to_string(),
        });
    };

    let mut fm_lines: Vec<String> = lines[start..close_index]
        .iter()
        .map(|line| (*line).to_string())
        .collect();
    if let Some(value) = &fields.date {
        set_scalar_frontmatter_field(&mut fm_lines, "date", value);
    }
    if let Some(values) = &fields.tags {
        set_list_frontmatter_field(&mut fm_lines, "tags", values);
    }
    if let Some(values) = &fields.related {
        set_list_frontmatter_field(&mut fm_lines, "related", values);
    }

    // The fence lines themselves are carried over VERBATIM (not a hardcoded
    // `"---"`) so a `\r` on a CRLF document's delimiter survives the rewrite —
    // this preview still feeds the human review diff, so line-ending fidelity
    // matters even though it is no longer the apply-time write-verification
    // authority (see `apply::PostVerifyExpectation`).
    let mut rebuilt = Vec::with_capacity(lines.len());
    rebuilt.push(lines[0].to_string());
    rebuilt.extend(fm_lines);
    rebuilt.push(lines[close_index].to_string());
    rebuilt.extend(
        lines[close_index + 1..]
            .iter()
            .map(|line| (*line).to_string()),
    );
    Ok(rebuilt.join("\n"))
}

/// The frontmatter block CONTENT range `[start, close_index)` — `start` is
/// always `1` (the line after the opening `---` fence), `close_index` is the
/// closing fence's own line index. `None` when `text` opens with no `---`
/// fence, or the fence never closes. Shared by the preview rewrite
/// (`rewrite_frontmatter_fields`) and the post-apply semantic read
/// (`frontmatter_fields_match`) so the two never drift on what counts as "the
/// frontmatter block".
fn frontmatter_block_range(lines: &[&str]) -> Option<(usize, usize)> {
    if lines.first().map(|line| line.trim_end_matches('\r')) != Some("---") {
        return None;
    }
    lines
        .iter()
        .enumerate()
        .skip(1)
        .find(|(_, line)| line.trim_end_matches('\r') == "---")
        .map(|(index, _)| (1, index))
}

/// Read the CURRENT frontmatter of `text` and confirm it carries exactly the
/// field values `fields` requests — ONLY the fields present in `fields` are
/// compared; every other field (and the body) is irrelevant. Tolerant of the
/// exact quoting/spacing a core write chooses (unlike the preview's own fixed
/// style): a value core wrote unquoted, single-quoted, or double-quoted all
/// compare equal once unquoted. `false` for a mismatch OR an unreadable/absent
/// frontmatter block — never an error, since this is a boolean semantic check,
/// not a materialization. Used ONLY to VERIFY a core-authoritative write
/// post-apply (`apply::PostVerifyExpectation::FrontmatterFields`) — never to
/// build a preview (that is `rewrite_frontmatter_fields`'s job).
pub(crate) fn frontmatter_fields_match(text: &str, fields: &FrontmatterEditFields) -> bool {
    let lines: Vec<&str> = text.split('\n').collect();
    let Some((start, end)) = frontmatter_block_range(&lines) else {
        return false;
    };
    let fm_lines: Vec<String> = lines[start..end]
        .iter()
        .map(|line| (*line).to_string())
        .collect();
    if let Some(expected) = &fields.date
        && read_scalar_frontmatter_field(&fm_lines, "date").as_ref() != Some(expected)
    {
        return false;
    }
    if let Some(expected) = &fields.tags
        && read_list_frontmatter_field(&fm_lines, "tags").as_ref() != Some(expected)
    {
        return false;
    }
    if let Some(expected) = &fields.related
        && read_list_frontmatter_field(&fm_lines, "related").as_ref() != Some(expected)
    {
        return false;
    }
    true
}

/// Read a scalar frontmatter field's CURRENT value (`key: value`), tolerantly
/// unquoting a single- or double-quoted value. `None` when the key is absent —
/// never assumed empty.
fn read_scalar_frontmatter_field(lines: &[String], key: &str) -> Option<String> {
    let line = lines
        .iter()
        .find(|line| is_frontmatter_field_key(line, key))?;
    let (_, value) = line.trim_end_matches('\r').split_once(':')?;
    Some(unquote_frontmatter_value(value.trim()))
}

/// Read a list frontmatter field's CURRENT items (`key:` + its indented `-
/// item` continuation lines), tolerantly unquoting each item. `None` when the
/// key is absent.
fn read_list_frontmatter_field(lines: &[String], key: &str) -> Option<Vec<String>> {
    let (start, end) = frontmatter_field_block_range(lines, key)?;
    Some(
        lines[start + 1..end]
            .iter()
            .filter_map(|line| {
                line.trim_end_matches('\r')
                    .trim()
                    .strip_prefix("- ")
                    .map(|item| unquote_frontmatter_value(item.trim()))
            })
            .collect(),
    )
}

/// Strip one layer of matching quotes (`'...'` or `"..."`) from a raw YAML
/// scalar, unescaping a doubled quote of the same kind (the encoding
/// `set_scalar_frontmatter_field`/`set_list_frontmatter_field` use, and a valid
/// core-written encoding too). A bare, unquoted value is returned unchanged.
fn unquote_frontmatter_value(raw: &str) -> String {
    if raw.len() >= 2 && raw.starts_with('\'') && raw.ends_with('\'') {
        raw[1..raw.len() - 1].replace("''", "'")
    } else if raw.len() >= 2 && raw.starts_with('"') && raw.ends_with('"') {
        raw[1..raw.len() - 1].replace("\"\"", "\"")
    } else {
        raw.to_string()
    }
}

/// Replace (or append) a scalar frontmatter field's line, quoting the value the
/// same way the vault's own scaffolded frontmatter quotes dates (`date: 'value'`).
/// A single-quote in `value` is YAML-escaped (doubled) so the rewritten line
/// stays valid YAML.
fn set_scalar_frontmatter_field(lines: &mut Vec<String>, key: &str, value: &str) {
    let escaped = value.replace('\'', "''");
    let line = format!("{key}: '{escaped}'");
    match lines
        .iter()
        .position(|line| is_frontmatter_field_key(line, key))
    {
        Some(index) => lines[index] = line,
        None => lines.push(line),
    }
}

/// Replace (or append) a list frontmatter field's block (`key:` + its indented
/// `- 'item'` continuation lines), quoting each item the same way the vault's
/// own scaffolded frontmatter quotes list entries.
fn set_list_frontmatter_field(lines: &mut Vec<String>, key: &str, values: &[String]) {
    let mut block = vec![format!("{key}:")];
    block.extend(
        values
            .iter()
            .map(|value| format!("  - '{}'", value.replace('\'', "''"))),
    );
    match frontmatter_field_block_range(lines, key) {
        Some((start, end)) => {
            lines.splice(start..end, block);
        }
        None => lines.extend(block),
    }
}

/// True when `line` is the top-level `key:` field header — a bare key at column
/// zero, never an indented continuation line (which belongs to a DIFFERENT key's
/// block, never this one's).
fn is_frontmatter_field_key(line: &str, key: &str) -> bool {
    let trimmed = line.trim_end_matches('\r');
    if trimmed.starts_with([' ', '\t']) {
        return false;
    }
    matches!(trimmed.split_once(':'), Some((found, _)) if found == key)
}

/// The `[start, end)` line range of `key`'s block: its header line plus every
/// following indented continuation line, or `None` when the key is absent.
fn frontmatter_field_block_range(lines: &[String], key: &str) -> Option<(usize, usize)> {
    let start = lines
        .iter()
        .position(|line| is_frontmatter_field_key(line, key))?;
    let mut end = start + 1;
    while end < lines.len() && lines[end].starts_with([' ', '\t']) && !lines[end].trim().is_empty()
    {
        end += 1;
    }
    Some((start, end))
}
