//! Review-diff hunk construction and bounded-lines/truncation helpers.

use super::*;

pub(super) fn build_diff_hunks(
    base_lines: &[String],
    target_lines: &[String],
) -> Vec<ReviewDiffHunk> {
    let lcs = lcs_lengths(base_lines, target_lines);
    let mut hunks = Vec::new();
    let mut hunk: Option<ReviewDiffHunk> = None;
    let mut base_index = 0;
    let mut target_index = 0;
    let mut base_line = 1;
    let mut target_line = 1;

    while base_index < base_lines.len() || target_index < target_lines.len() {
        if base_index < base_lines.len()
            && target_index < target_lines.len()
            && base_lines[base_index] == target_lines[target_index]
        {
            finish_hunk(&mut hunk, &mut hunks);
            base_index += 1;
            target_index += 1;
            base_line += 1;
            target_line += 1;
            continue;
        }

        if target_index < target_lines.len()
            && (base_index == base_lines.len()
                || lcs[base_index][target_index + 1] > lcs[base_index + 1][target_index])
        {
            current_hunk(&mut hunk, base_line, target_line)
                .added
                .push(target_lines[target_index].clone());
            target_index += 1;
            target_line += 1;
            continue;
        }

        if base_index < base_lines.len() {
            current_hunk(&mut hunk, base_line, target_line)
                .removed
                .push(base_lines[base_index].clone());
            base_index += 1;
            base_line += 1;
            continue;
        }
    }

    finish_hunk(&mut hunk, &mut hunks);
    hunks
}

fn lcs_lengths(base_lines: &[String], target_lines: &[String]) -> Vec<Vec<usize>> {
    let mut table = vec![vec![0; target_lines.len() + 1]; base_lines.len() + 1];
    for base_index in (0..base_lines.len()).rev() {
        for target_index in (0..target_lines.len()).rev() {
            table[base_index][target_index] =
                if base_lines[base_index] == target_lines[target_index] {
                    table[base_index + 1][target_index + 1] + 1
                } else {
                    table[base_index + 1][target_index].max(table[base_index][target_index + 1])
                };
        }
    }
    table
}

fn current_hunk(
    hunk: &mut Option<ReviewDiffHunk>,
    base_line: usize,
    target_line: usize,
) -> &mut ReviewDiffHunk {
    hunk.get_or_insert_with(|| ReviewDiffHunk {
        base_start_line: base_line,
        base_line_count: 0,
        target_start_line: target_line,
        target_line_count: 0,
        removed: Vec::new(),
        added: Vec::new(),
    })
}

fn finish_hunk(hunk: &mut Option<ReviewDiffHunk>, hunks: &mut Vec<ReviewDiffHunk>) {
    if let Some(mut completed) = hunk.take() {
        completed.base_line_count = completed.removed.len();
        completed.target_line_count = completed.added.len();
        hunks.push(completed);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct BoundedLines {
    pub(super) lines: Vec<String>,
    pub(super) total_lines: usize,
    total_bytes: usize,
    returned_bytes: usize,
}

impl BoundedLines {
    fn truncated(&self) -> bool {
        self.total_lines > self.lines.len() || self.total_bytes > self.returned_bytes
    }
}

pub(super) fn bounded_lines_with_endings(text: &str) -> BoundedLines {
    let mut lines = Vec::with_capacity(REVIEW_DIFF_LINE_CAP.min(16));
    let mut total_lines = 0;
    let total_bytes = text.len();
    let mut returned_bytes = 0;
    let mut start = 0;
    for (index, ch) in text.char_indices() {
        if ch == '\n' {
            total_lines += 1;
            if lines.len() < REVIEW_DIFF_LINE_CAP {
                push_bounded_line(&mut lines, &mut returned_bytes, &text[start..=index]);
            }
            start = index + 1;
        }
    }
    if start < text.len() {
        total_lines += 1;
        if lines.len() < REVIEW_DIFF_LINE_CAP {
            push_bounded_line(&mut lines, &mut returned_bytes, &text[start..]);
        }
    }
    BoundedLines {
        lines,
        total_lines,
        total_bytes,
        returned_bytes,
    }
}

fn push_bounded_line(lines: &mut Vec<String>, returned_bytes: &mut usize, line: &str) {
    if *returned_bytes >= REVIEW_DIFF_BYTE_CAP {
        return;
    }
    let remaining = REVIEW_DIFF_BYTE_CAP - *returned_bytes;
    let bounded = if line.len() <= remaining {
        line
    } else {
        truncate_at_char_boundary(line, remaining)
    };
    if bounded.is_empty() {
        return;
    }
    *returned_bytes += bounded.len();
    lines.push(bounded.to_string());
}

fn truncate_at_char_boundary(value: &str, max_bytes: usize) -> &str {
    if value.len() <= max_bytes {
        return value;
    }
    let mut boundary = 0;
    for (index, _) in value.char_indices() {
        if index > max_bytes {
            break;
        }
        boundary = index;
    }
    &value[..boundary]
}

pub(super) fn truncation(
    base_lines: &BoundedLines,
    target_lines: &BoundedLines,
) -> Option<ReviewDiffTruncation> {
    if !base_lines.truncated() && !target_lines.truncated() {
        return None;
    }
    Some(ReviewDiffTruncation {
        line_cap: REVIEW_DIFF_LINE_CAP,
        byte_cap: REVIEW_DIFF_BYTE_CAP,
        total_base_lines: base_lines.total_lines,
        total_target_lines: target_lines.total_lines,
        returned_base_lines: base_lines.lines.len(),
        returned_target_lines: target_lines.lines.len(),
        total_base_bytes: base_lines.total_bytes,
        total_target_bytes: target_lines.total_bytes,
        returned_base_bytes: base_lines.returned_bytes,
        returned_target_bytes: target_lines.returned_bytes,
        reason: format!(
            "review diff cap reached (lines {REVIEW_DIFF_LINE_CAP}, bytes {REVIEW_DIFF_BYTE_CAP}); full target snapshot remains authoritative"
        ),
    })
}
