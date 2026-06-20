//! Plan-structure parsing (dashboard-pipeline-wire W03, engine ADR
//! `2026-06-12-vaultspec-engine-adr` §4.3 / D4.1): parse a plan document body
//! into its canonical wave/phase/step tree with per-step completion.
//!
//! This is the one genuinely-new ingest surface this cycle. It is deterministic
//! and bounded — the canonical identifier scheme (`W##`/`P##`/`S##`, dotted
//! display paths) is fixed by the plan template, and the parsed node count is
//! capped with honest truncation (`graph-queries-are-bounded-by-default`). The
//! parser observes the document; it never edits it (`engine-read-and-infer`).
//!
//! Tier shape (CLAUDE.md plan conventions): L1 is steps only, L2 adds phases,
//! L3/L4 add waves. The parser reads what the document actually carries and
//! never invents an absent container.

use serde::{Deserialize, Serialize};

/// Node ceiling for a parsed plan interior (dashboard-pipeline-wire W03.P06.S31
/// / `graph-queries-are-bounded-by-default`): a large L4 plan's full step tree
/// is a real payload, so the parsed structure is bounded and any overflow is
/// reported honestly rather than serialized whole. The count is total entities
/// (waves + phases + steps). 2000 entities is generous for any real plan while
/// bounding a pathological one.
pub const MAX_PLAN_STRUCTURE_NODES: usize = 2000;

/// A parsed plan wave (`W##`), carrying its canonical id, heading prose, and
/// ordered phases.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanWave {
    /// Canonical container id (`W##`).
    pub id: String,
    /// Heading prose after the id (the wave title), empty when absent.
    pub heading: String,
    pub phases: Vec<PlanPhase>,
}

/// A parsed plan phase (`P##`), carrying its canonical id, heading prose, and
/// ordered steps.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanPhase {
    /// Canonical container id (`P##`).
    pub id: String,
    pub heading: String,
    pub steps: Vec<PlanStep>,
}

/// A parsed plan step (`S##`), carrying its canonical id, the action prose, and
/// per-step completion read from the two-state checkbox.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanStep {
    /// Canonical container id (`S##`).
    pub id: String,
    /// The imperative action text after the id (trimmed), for display.
    pub action: String,
    /// Completion read from the checkbox glyph: `- [x]`/`- [X]` closed, `- [ ]`
    /// open. This is the live signal the Work surface renders.
    pub done: bool,
}

/// Honest truncation report (dashboard-pipeline-wire W03.P06.S31, mirroring the
/// graph-query `truncated` block): the original total and what was kept.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanTruncated {
    pub total_nodes: usize,
    pub returned_nodes: usize,
    pub reason: String,
}

/// A parsed plan structure: the ordered wave/phase/step tree at whatever depth
/// the document carries, plus an optional truncation block when the entity
/// count exceeded the ceiling.
///
/// Tier-shape honest (W03.P06.S33): an L1 plan parses as `waves: []`,
/// `phases: []`, and a flat `steps` list; an L2 plan carries phases with no
/// waves; L3/L4 carry the full wave tree. The parser never synthesizes a
/// container the document does not declare.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct PlanStructure {
    /// L3/L4 waves, each with its phases and steps. Empty below L3.
    pub waves: Vec<PlanWave>,
    /// L2 phases that sit directly under the plan (no enclosing wave). Empty at
    /// L1, and empty at L3/L4 (phases live inside waves there).
    pub phases: Vec<PlanPhase>,
    /// L1 steps that sit directly under the plan (no enclosing phase/wave).
    pub steps: Vec<PlanStep>,
    /// Present only when the entity count exceeded `MAX_PLAN_STRUCTURE_NODES`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<PlanTruncated>,
}

impl PlanStructure {
    /// Total parsed entities (waves + phases + steps), across all depths.
    pub fn entity_count(&self) -> usize {
        let mut n = self.waves.len() + self.phases.len() + self.steps.len();
        for w in &self.waves {
            n += w.phases.len();
            for p in &w.phases {
                n += p.steps.len();
            }
        }
        for p in &self.phases {
            n += p.steps.len();
        }
        n
    }
}

/// A line classified by its canonical grammar.
enum Line<'a> {
    Wave { id: String, heading: &'a str },
    Phase { id: String, heading: &'a str },
    Step(PlanStep),
}

/// Parse a plan document body into its wave/phase/step tree (W03.P06.S29).
///
/// Deterministic single pass over the lines: a `## Wave `W##`` heading opens a
/// wave, a `### Phase `W##.P##`` heading opens a phase under the current wave
/// (or directly under the plan at L2), and a `- [ ]`/`- [x]` step row appends a
/// step to the current phase (or directly under the plan at L1). The canonical
/// id is the LAST dotted segment of the backtick-wrapped display path, so the
/// parser reads `W01.P02.S03` and binds the step under its canonical `S03`.
///
/// Bounded (W03.P06.S31): once the entity ceiling is reached, parsing stops
/// appending and records the honest total it would have produced had it
/// continued, keeping the returned subtree self-consistent.
pub fn parse_plan_structure(text: &str) -> PlanStructure {
    // The plan template scaffolds hint blocks as HTML comments carrying EXAMPLE
    // canonical lines (`## Wave `W01` - ...`, `### Phase `W01.P01` - ...`,
    // `- [ ] `P02.S01` - ...`). Those are documentation, never real structure —
    // but they are byte-identical to the canonical grammar, so parsing the raw
    // body adopts them: a trailing `## Wave `W01` - ...` example clobbers the real
    // W01 heading to "..." (upsert-by-id, last write wins), and the example phase
    // rows mint phantom containers. Strip the comment regions before classifying
    // so the parser observes only the authored structure (`engine-read-and-infer`).
    let body = strip_html_comments(text);

    let mut structure = PlanStructure::default();
    // Current open containers (None until one is opened at the right depth).
    let mut cur_wave: Option<usize> = None;
    let mut cur_phase_in_wave: Option<usize> = None;
    let mut cur_phase_top: Option<usize> = None;

    let mut count = 0usize;
    // The honest total had we not stopped: we keep counting classifiable
    // entities even after the cap so the truncation report is truthful.
    let mut total = 0usize;
    let mut capped = false;

    for raw in body.lines() {
        let Some(line) = classify_line(raw) else {
            continue;
        };
        total += 1;
        let at_cap = count >= MAX_PLAN_STRUCTURE_NODES;
        if at_cap {
            capped = true;
            continue;
        }
        match line {
            Line::Wave { id, heading } => {
                structure.waves.push(PlanWave {
                    id,
                    heading: heading.to_string(),
                    phases: Vec::new(),
                });
                cur_wave = Some(structure.waves.len() - 1);
                cur_phase_in_wave = None;
                cur_phase_top = None;
            }
            Line::Phase { id, heading } => {
                let phase = PlanPhase {
                    id,
                    heading: heading.to_string(),
                    steps: Vec::new(),
                };
                match cur_wave {
                    Some(w) => {
                        structure.waves[w].phases.push(phase);
                        cur_phase_in_wave = Some(structure.waves[w].phases.len() - 1);
                    }
                    None => {
                        structure.phases.push(phase);
                        cur_phase_top = Some(structure.phases.len() - 1);
                    }
                }
            }
            Line::Step(step) => match (cur_wave, cur_phase_in_wave, cur_phase_top) {
                // A step inside a wave's current phase (L3/L4).
                (Some(w), Some(p), _) => structure.waves[w].phases[p].steps.push(step),
                // A step inside a top-level phase (L2).
                (None, _, Some(p)) => structure.phases[p].steps.push(step),
                // A step with no enclosing phase/wave (L1, steps-only).
                _ => structure.steps.push(step),
            },
        }
        count += 1;
    }

    if capped {
        structure.truncated = Some(PlanTruncated {
            total_nodes: total,
            returned_nodes: count,
            reason: format!(
                "plan structure node ceiling ({MAX_PLAN_STRUCTURE_NODES}); \
                 the returned subtree is self-consistent up to the cap"
            ),
        });
    }
    // Canonical-first with a legacy fallback (plan-structure-tolerance ADR): the
    // strict parse above is authoritative. Only when it found NO canonical step
    // rows do we fall back to a flat checklist of the body's two-state checkboxes
    // — exactly the items the lifecycle progress ring already counts — so a
    // legacy plan's step tree is a useful flat list instead of empty. A canonical
    // plan (any S## row) never reaches the fallback.
    if total_steps(&structure) == 0 {
        return parse_flat_checklist(&body);
    }
    structure
}

/// Remove `<!-- ... -->` comment regions, preserving everything outside them.
///
/// The plan template's hint blocks are HTML comments holding example canonical
/// lines that must not be parsed as real structure. Comment spans (including
/// their newlines) are dropped; text outside any comment is kept verbatim, so
/// the surviving line grammar is exactly the authored body. An unterminated
/// `<!--` drops the remainder (a malformed tail carries no authored structure).
fn strip_html_comments(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("<!--") {
        out.push_str(&rest[..start]);
        match rest[start + 4..].find("-->") {
            Some(end) => rest = &rest[start + 4 + end + 3..],
            None => return out,
        }
    }
    out.push_str(rest);
    out
}

/// Total parsed step rows across every depth (the canonical-vs-legacy switch).
fn total_steps(s: &PlanStructure) -> usize {
    let mut n = s.steps.len();
    for w in &s.waves {
        for p in &w.phases {
            n += p.steps.len();
        }
    }
    for p in &s.phases {
        n += p.steps.len();
    }
    n
}

/// Legacy fallback (plan-structure-tolerance ADR): list every two-state checkbox
/// in the body as a flat L1 step list with positional ids (`S01`, `S02`, ... in
/// document order), matching exactly the checkbox set the lifecycle progress ring
/// counts. No phases or waves are inferred from legacy prose — a flat, accurate
/// list is more honest than a guessed hierarchy. Bounded with honest truncation.
fn parse_flat_checklist(text: &str) -> PlanStructure {
    let mut steps: Vec<PlanStep> = Vec::new();
    let mut total = 0usize;
    let mut capped = false;
    for raw in text.lines() {
        let Some((done, action)) = checkbox_line(raw) else {
            continue;
        };
        total += 1;
        if steps.len() >= MAX_PLAN_STRUCTURE_NODES {
            capped = true;
            continue;
        }
        steps.push(PlanStep {
            id: format!("S{:02}", steps.len() + 1),
            action: action.to_string(),
            done,
        });
    }
    let truncated = capped.then(|| PlanTruncated {
        total_nodes: total,
        returned_nodes: steps.len(),
        reason: format!(
            "plan structure node ceiling ({MAX_PLAN_STRUCTURE_NODES}); \
             the returned checklist is bounded at the cap"
        ),
    });
    PlanStructure {
        waves: Vec::new(),
        phases: Vec::new(),
        steps,
        truncated,
    }
}

/// Classify a line as a two-state checkbox, returning `(done, action-text)` for
/// ANY `- [ ]`/`- [x]`/`- [X]` row regardless of whether it carries a canonical
/// id. Used only by the legacy flat fallback; the canonical parse keeps its
/// stricter `classify_line` grammar.
fn checkbox_line(raw: &str) -> Option<(bool, &str)> {
    let rest = raw.trim_start().strip_prefix("- [")?;
    let done = match rest.as_bytes().first() {
        Some(b'x') | Some(b'X') => true,
        Some(b' ') => false,
        _ => return None,
    };
    let action = rest.get(1..)?.strip_prefix(']')?.trim();
    Some((done, action))
}

/// Classify one line into the canonical plan grammar, or `None` for prose.
fn classify_line(raw: &str) -> Option<Line<'_>> {
    let trimmed = raw.trim_start();
    // Step row: `- [ ]` / `- [x]` / `- [X]` followed by a backtick-wrapped id.
    if let Some(rest) = trimmed.strip_prefix("- [") {
        let done = match rest.as_bytes().first() {
            Some(b'x') | Some(b'X') => true,
            Some(b' ') => false,
            _ => return None,
        };
        let rest = rest.get(1..)?.strip_prefix("] ")?;
        let (display, action) = first_backtick_path(rest)?;
        let id = canonical_id(&display)?;
        // Only an S-segment id is a step.
        if !id.starts_with('S') {
            return None;
        }
        return Some(Line::Step(PlanStep {
            id,
            action: action.to_string(),
            done,
        }));
    }
    // Wave heading: `## Wave `W##`` (exactly two hashes; `###` is a phase).
    if let Some(rest) = heading_after(trimmed, "## ").filter(|_| !trimmed.starts_with("### ")) {
        if let Some(rest) = rest.strip_prefix("Wave ") {
            let (display, heading) = first_backtick_path(rest)?;
            let id = canonical_id(&display)?;
            if id.starts_with('W') {
                return Some(Line::Wave { id, heading });
            }
        }
        return None;
    }
    // Phase heading: `### Phase `W##.P##``.
    if let Some(rest) = heading_after(trimmed, "### ") {
        if let Some(rest) = rest.strip_prefix("Phase ") {
            let (display, heading) = first_backtick_path(rest)?;
            let id = canonical_id(&display)?;
            if id.starts_with('P') {
                return Some(Line::Phase { id, heading });
            }
        }
        return None;
    }
    None
}

/// Strip a heading marker prefix, returning the remainder.
fn heading_after<'a>(line: &'a str, marker: &str) -> Option<&'a str> {
    line.strip_prefix(marker)
}

/// Read the first backtick-wrapped token and the prose after it. The token is
/// the canonical display path (`W01`, `W01.P02`, `W01.P02.S03`); the prose is
/// trimmed of a leading ` - ` separator.
fn first_backtick_path(s: &str) -> Option<(String, &str)> {
    let start = s.find('`')? + 1;
    let end = s[start..].find('`')? + start;
    let token = s[start..end].to_string();
    let after = s[end + 1..].trim_start();
    let after = after.strip_prefix("- ").unwrap_or(after).trim();
    Some((token, after))
}

/// The canonical container id is the LAST dotted segment of a display path:
/// `W01.P02.S03` -> `S03`, `W01.P02` -> `P02`, `W01` -> `W01`. Validated to a
/// `[WPS]##+` token (zero-padded to at least two digits), the plan template's
/// canonical identifier form — so prose backticks that happen to wrap other
/// text never mis-parse as a container.
fn canonical_id(display: &str) -> Option<String> {
    let last = display.rsplit('.').next()?;
    let mut chars = last.chars();
    let prefix = chars.next()?;
    if !matches!(prefix, 'W' | 'P' | 'S') {
        return None;
    }
    let digits: String = chars.collect();
    if digits.len() < 2 || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(last.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const L3_FIXTURE: &str = "\
# `demo` plan

## Wave `W01` - first wave

### Phase `W01.P01` - first phase

- [x] `W01.P01.S01` - did the first thing; `src/a.rs`.
- [ ] `W01.P01.S02` - do the second thing; `src/b.rs`.

### Phase `W01.P02` - second phase

- [ ] `W01.P02.S03` - a later step; `src/c.rs`.

## Wave `W02` - second wave

### Phase `W02.P03` - third phase

- [x] `W02.P03.S04` - already done.
";

    #[test]
    fn parses_an_l3_wave_phase_step_tree_with_completion() {
        // W03.P06.S32: the full L3 tree, each step's completion read honestly
        // from its checkbox glyph.
        let s = parse_plan_structure(L3_FIXTURE);
        assert!(
            s.phases.is_empty() && s.steps.is_empty(),
            "L3 lives in waves"
        );
        assert_eq!(s.waves.len(), 2);

        let w1 = &s.waves[0];
        assert_eq!(w1.id, "W01");
        assert_eq!(w1.heading, "first wave");
        assert_eq!(w1.phases.len(), 2);

        let p1 = &w1.phases[0];
        assert_eq!(p1.id, "P01");
        assert_eq!(p1.heading, "first phase");
        assert_eq!(p1.steps.len(), 2);
        assert_eq!(p1.steps[0].id, "S01");
        assert!(p1.steps[0].done, "- [x] is closed");
        assert!(p1.steps[0].action.starts_with("did the first thing"));
        assert_eq!(p1.steps[1].id, "S02");
        assert!(!p1.steps[1].done, "- [ ] is open");

        let p2 = &w1.phases[1];
        assert_eq!(p2.id, "P02");
        assert_eq!(p2.steps[0].id, "S03");

        let w2 = &s.waves[1];
        assert_eq!(w2.id, "W02");
        assert_eq!(w2.phases[0].id, "P03");
        assert_eq!(w2.phases[0].steps[0].id, "S04");
        assert!(w2.phases[0].steps[0].done);
        assert!(s.truncated.is_none(), "small plan is not truncated");
        assert_eq!(s.entity_count(), 2 + 3 + 4); // 2 waves, 3 phases, 4 steps
    }

    #[test]
    fn l1_and_l2_plans_parse_without_inventing_absent_containers() {
        // W03.P06.S33: an L1 (steps-only) plan parses as a flat step list with
        // no waves/phases; an L2 (phases) plan carries phases with no waves.
        let l1 = "\
# `demo` plan

- [x] `S01` - first; `src/a.rs`.
- [ ] `S02` - second.
";
        let s1 = parse_plan_structure(l1);
        assert!(s1.waves.is_empty(), "L1 invents no wave");
        assert!(s1.phases.is_empty(), "L1 invents no phase");
        assert_eq!(s1.steps.len(), 2);
        assert_eq!(s1.steps[0].id, "S01");
        assert!(s1.steps[0].done);
        assert!(!s1.steps[1].done);

        let l2 = "\
# `demo` plan

### Phase `P01` - the phase

- [x] `P01.S01` - did it.
- [ ] `P01.S02` - todo.

### Phase `P02` - second phase

- [ ] `P02.S03` - later.
";
        let s2 = parse_plan_structure(l2);
        assert!(s2.waves.is_empty(), "L2 invents no wave");
        assert_eq!(s2.phases.len(), 2);
        assert_eq!(s2.phases[0].id, "P01");
        assert_eq!(s2.phases[0].steps.len(), 2);
        assert_eq!(s2.phases[0].steps[0].id, "S01");
        assert_eq!(s2.phases[1].id, "P02");
        assert_eq!(s2.phases[1].steps[0].id, "S03");
        assert!(s2.steps.is_empty(), "no orphan steps at L2");
    }

    #[test]
    fn the_structure_is_bounded_with_honest_truncation() {
        // W03.P06.S31: a plan whose entity count exceeds the ceiling truncates
        // at the cap and reports the original total honestly.
        let mut body = String::from("# `big` plan\n\n### Phase `P01` - p\n\n");
        let steps = MAX_PLAN_STRUCTURE_NODES + 50;
        for i in 0..steps {
            // `P01.S{n}` rows; ids beyond 99 still match the digit rule.
            body.push_str(&format!("- [ ] `P01.S{i:02}` - step {i}.\n"));
        }
        let s = parse_plan_structure(&body);
        let kept = s.entity_count();
        let trunc = s.truncated.clone().expect("oversized plan truncates");
        assert_eq!(
            trunc.returned_nodes, MAX_PLAN_STRUCTURE_NODES,
            "kept exactly the ceiling"
        );
        assert_eq!(
            trunc.total_nodes,
            1 + steps,
            "honest total counts the phase + every step it would have produced"
        );
        assert_eq!(
            kept, MAX_PLAN_STRUCTURE_NODES,
            "the returned subtree holds exactly the cap"
        );
    }

    #[test]
    fn a_legacy_plan_falls_back_to_a_flat_checklist_matching_the_progress_count() {
        // plan-structure-tolerance ADR (F1): a plan with prose phase headings and
        // plain (non-canonical) checkbox steps has NO canonical S## rows, so the
        // strict parse yields nothing. The flat fallback then lists every two-state
        // checkbox in document order with positional ids — the same set the
        // lifecycle progress ring counts.
        let legacy = "\
# modelo-inventory plan

## Phases

### Phase 1 - Scaffolding

Prose describing the phase, no checkboxes here.

## Acceptance checklist

- [x] `ModeloCode` StrEnum with 20 members - Phase 2.
- [ ] registry assembly invariant holds - Phase 5.
- [X] CLI command `aeat modelo list` works - Phase 7.
";
        let s = parse_plan_structure(legacy);
        assert!(s.waves.is_empty(), "no waves inferred from legacy prose");
        assert!(s.phases.is_empty(), "no phases inferred from legacy prose");
        assert_eq!(s.steps.len(), 3, "every body checkbox becomes a flat step");
        assert_eq!(s.steps[0].id, "S01");
        assert!(s.steps[0].done, "- [x] is closed");
        assert!(s.steps[0].action.starts_with("`ModeloCode` StrEnum"));
        assert_eq!(s.steps[1].id, "S02");
        assert!(!s.steps[1].done, "- [ ] is open");
        assert_eq!(s.steps[2].id, "S03");
        assert!(s.steps[2].done, "- [X] is closed");
    }

    #[test]
    fn a_canonical_plan_never_uses_the_legacy_fallback() {
        // The authoritative canonical parse wins even when stray non-canonical
        // checkboxes exist elsewhere in the document: those are NOT pulled into
        // the step list by the fallback, because canonical steps were found.
        let mixed = "\
# `demo` plan

### Phase `P01` - the phase

- [ ] `P01.S01` - the one real step; `src/a.rs`.

## Acceptance checklist

- [ ] a stray checklist item that is not a plan step.
";
        let s = parse_plan_structure(mixed);
        assert_eq!(s.phases.len(), 1, "canonical phase parsed");
        assert_eq!(s.phases[0].steps.len(), 1, "exactly the canonical step");
        assert_eq!(s.phases[0].steps[0].id, "S01");
        assert!(
            s.steps.is_empty(),
            "the stray checklist item is not adopted"
        );
    }

    #[test]
    fn template_hint_comments_are_not_parsed_as_structure() {
        // The plan template scaffolds trailing HTML-comment hint blocks holding
        // EXAMPLE canonical lines. They are byte-identical to the real grammar,
        // so without stripping them the parser adopts them: a trailing
        // `## Wave `W01` - ...` example overwrites the real W01 heading with
        // "...", example `### Phase` lines re-head real phases, and example
        // `- [ ] `P02.S01`` rows mint phantom steps. This reproduces the live
        // defect (W01/W02 headings shown as "...", phantom phases) and asserts
        // the stripped parse observes only the authored structure.
        let body = "\
# `demo` plan

## Wave `W01` - keymap core

### Phase `W01.P01` - chord primitive

- [x] `W01.P01.S01` - real step one.
- [ ] `W01.P01.S02` - real step two.

## Wave `W02` - settings hardening

### Phase `W02.P02` - the second phase

- [x] `W02.P02.S03` - real step three.

<!-- PHASE BLOCK FORMAT:
     ### Phase `P02` - rewrite the writer-agent contract

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`. -->

<!-- WAVE BLOCK FORMAT:
     ## Wave `W01` - language-only convention rollout

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ... -->

<!-- EPIC INTENT BLOCK FORMAT:
     ## Wave `W01` - ...
     ## Wave `W02` - ... -->
";
        let s = parse_plan_structure(body);
        assert_eq!(s.waves.len(), 2, "exactly the two authored waves");
        // Headings survive: the trailing `## Wave `W01` - ...` example no longer
        // clobbers the real heading.
        assert_eq!(s.waves[0].id, "W01");
        assert_eq!(s.waves[0].heading, "keymap core");
        assert_eq!(s.waves[1].id, "W02");
        assert_eq!(s.waves[1].heading, "settings hardening");
        // No phantom phases minted from the comment examples.
        assert_eq!(s.waves[0].phases.len(), 1, "only the authored phase");
        assert_eq!(s.waves[0].phases[0].heading, "chord primitive");
        assert_eq!(s.waves[0].phases[0].steps.len(), 2);
        assert_eq!(s.waves[1].phases.len(), 1);
        assert_eq!(s.waves[1].phases[0].steps.len(), 1);
        // No phantom steps adopted from the example `- [ ] `P02.S01`` rows.
        assert_eq!(s.entity_count(), 2 + 2 + 3, "2 waves, 2 phases, 3 steps");
        assert!(
            s.steps.is_empty() && s.phases.is_empty(),
            "L3 lives in waves"
        );
    }

    #[test]
    fn strip_html_comments_keeps_body_and_drops_comment_spans() {
        assert_eq!(
            strip_html_comments("a\n<!-- x\ny -->\nb"),
            "a\n\nb",
            "multi-line comment span removed, surrounding lines kept"
        );
        assert_eq!(
            strip_html_comments("keep <!-- drop --> tail"),
            "keep  tail",
            "inline comment removed"
        );
        assert_eq!(
            strip_html_comments("before <!-- unterminated"),
            "before ",
            "unterminated comment drops the remainder"
        );
    }

    #[test]
    fn prose_backticks_and_non_canonical_tokens_do_not_mis_parse() {
        // On the canonical path (a real S## row is present, so the legacy
        // fallback never runs): a `- [ ]` whose first backtick wraps a path, not
        // a canonical id, is not a step; a `## Wave` heading whose token is not
        // W## is ignored.
        let body = "\
# `demo` plan

### Phase `P01` - p

- [x] `P01.S01` - the real canonical step.
- [ ] `src/not-a-step.rs` - a checkbox that mentions a file, not a step.

## Wave `notwave` - bogus heading
";
        let s = parse_plan_structure(body);
        assert_eq!(s.phases.len(), 1);
        assert_eq!(
            s.phases[0].steps.len(),
            1,
            "only the canonical S01 is a step; the path-backtick checkbox is not"
        );
        assert_eq!(s.phases[0].steps[0].id, "S01");
        assert!(s.waves.is_empty(), "a non-W## wave heading is ignored");
        assert!(
            s.steps.is_empty(),
            "the non-canonical checkbox is not adopted on the canonical path"
        );
    }
}
