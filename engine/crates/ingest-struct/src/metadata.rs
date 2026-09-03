//! Canonical structural metadata parsed from a vault document exactly once.
//!
//! ADR status and plan tier are authored lifecycle facts, not graph-local
//! heuristics. Consumers can distinguish template-canonical values from the
//! narrow legacy ADR heading tolerance without re-scanning the document.

/// Whether a parsed value follows the current template grammar or a retained
/// legacy form.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MetadataProvenance {
    Canonical,
    Legacy,
}

/// A typed metadata value together with the grammar that admitted it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParsedMetadata<T> {
    pub value: T,
    pub provenance: MetadataProvenance,
}

/// The ADR lifecycle vocabulary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdrStatus {
    Proposed,
    Accepted,
    Rejected,
    Deprecated,
}

impl AdrStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Proposed => "proposed",
            Self::Accepted => "accepted",
            Self::Rejected => "rejected",
            Self::Deprecated => "deprecated",
        }
    }
}

/// The plan complexity tier vocabulary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlanTier {
    L1,
    L2,
    L3,
    L4,
}

impl PlanTier {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::L1 => "L1",
            Self::L2 => "L2",
            Self::L3 => "L3",
            Self::L4 => "L4",
        }
    }
}

/// Parsed structural lifecycle metadata for one document.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct DocumentMetadata {
    /// ADR status from its H1. A legacy spelling is labelled rather than
    /// silently presented as template-canonical.
    pub adr_status: Option<ParsedMetadata<AdrStatus>>,
    /// Plan tier from frontmatter. The supported `tier: L#` grammar is the
    /// canonical plan-template field.
    pub plan_tier: Option<ParsedMetadata<PlanTier>>,
}

/// Parse ADR status and plan tier from one document body.
///
/// The parser makes one frontmatter pass and one fence-aware body pass. A
/// template ADR marker (`**status:** `accepted``) is canonical. The prior
/// H1-only `status ... accepted` tolerance remains available to lifecycle
/// callers, explicitly labelled `Legacy`; canonical facet callers can reject
/// it without another document scan.
pub fn parse_document_metadata(text: &str) -> DocumentMetadata {
    let plan_tier = initial_frontmatter(text).and_then(parse_plan_tier);
    let adr_status = first_h1_outside_fences(text).and_then(parse_adr_status);
    DocumentMetadata {
        adr_status,
        plan_tier,
    }
}

fn initial_frontmatter(text: &str) -> Option<&str> {
    let rest = text.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    Some(&rest[..end])
}

fn parse_plan_tier(frontmatter: &str) -> Option<ParsedMetadata<PlanTier>> {
    let value = frontmatter.lines().find_map(|line| {
        let value = line.trim().strip_prefix("tier:")?.trim();
        let value = value.trim_matches('\'').trim_matches('"').trim();
        (!value.is_empty()).then_some(value)
    })?;
    let value = match value {
        "L1" => PlanTier::L1,
        "L2" => PlanTier::L2,
        "L3" => PlanTier::L3,
        "L4" => PlanTier::L4,
        _ => return None,
    };
    Some(ParsedMetadata {
        value,
        provenance: MetadataProvenance::Canonical,
    })
}

fn first_h1_outside_fences(text: &str) -> Option<&str> {
    let mut fence: Option<&str> = None;
    for line in text.lines() {
        let trimmed = line.trim_start();
        let marker = if trimmed.starts_with("```") {
            Some("```")
        } else if trimmed.starts_with("~~~") {
            Some("~~~")
        } else {
            None
        };
        match (fence, marker) {
            (None, Some(marker)) => fence = Some(marker),
            (Some(open), Some(marker)) if open == marker => fence = None,
            (Some(_), _) => {}
            (None, None) if line.starts_with("# ") => return Some(line),
            (None, None) => {}
        }
    }
    None
}

fn parse_adr_status(h1: &str) -> Option<ParsedMetadata<AdrStatus>> {
    let marker = "**status:**";
    if let Some((_, after)) = h1.split_once(marker)
        && let Some(value) = backtick_value(after).and_then(parse_adr_status_value)
    {
        return Some(ParsedMetadata {
            value,
            provenance: MetadataProvenance::Canonical,
        });
    }

    let lower = h1.to_ascii_lowercase();
    if !lower.contains("status") {
        return None;
    }
    [
        ("deprecated", AdrStatus::Deprecated),
        ("rejected", AdrStatus::Rejected),
        ("accepted", AdrStatus::Accepted),
        ("proposed", AdrStatus::Proposed),
    ]
    .into_iter()
    .find(|(token, _)| contains_ascii_word(&lower, token))
    .map(|(_, value)| ParsedMetadata {
        value,
        provenance: MetadataProvenance::Legacy,
    })
}

fn backtick_value(text: &str) -> Option<&str> {
    let start = text.find('`')? + 1;
    let end = text[start..].find('`')? + start;
    Some(text[start..end].trim())
}

fn parse_adr_status_value(value: &str) -> Option<AdrStatus> {
    match value.to_ascii_lowercase().as_str() {
        "proposed" => Some(AdrStatus::Proposed),
        "accepted" => Some(AdrStatus::Accepted),
        "rejected" => Some(AdrStatus::Rejected),
        "deprecated" => Some(AdrStatus::Deprecated),
        _ => None,
    }
}

fn contains_ascii_word(haystack: &str, needle: &str) -> bool {
    haystack.match_indices(needle).any(|(index, _)| {
        let before = haystack[..index].chars().next_back();
        let after = haystack[index + needle.len()..].chars().next();
        !before.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
            && !after.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_template_metadata_once_with_typed_canonical_provenance() {
        let document = "---\ntags:\n  - '#adr'\ntier: 'L3'\n---\n\n# `x` adr: `topic` | (**status:** `Accepted`)\n";
        let metadata = parse_document_metadata(document);
        assert_eq!(
            metadata.adr_status,
            Some(ParsedMetadata {
                value: AdrStatus::Accepted,
                provenance: MetadataProvenance::Canonical,
            })
        );
        assert_eq!(
            metadata.plan_tier,
            Some(ParsedMetadata {
                value: PlanTier::L3,
                provenance: MetadataProvenance::Canonical,
            })
        );
    }

    #[test]
    fn preserves_the_h1_legacy_adr_tolerance_with_explicit_provenance() {
        let document = "# Historical decision — status accepted\n\nbody\n";
        let metadata = parse_document_metadata(document);
        assert_eq!(
            metadata.adr_status,
            Some(ParsedMetadata {
                value: AdrStatus::Accepted,
                provenance: MetadataProvenance::Legacy,
            })
        );
        assert_eq!(metadata.plan_tier, None);
    }

    #[test]
    fn rejects_fenced_examples_and_out_of_vocabulary_values() {
        let document = "```md\n# Example (**status:** `accepted`)\n```\n\n# Real ADR (**status:** `superseded`)\n\n---\ntier: L9\n---\n";
        assert_eq!(
            parse_document_metadata(document),
            DocumentMetadata::default()
        );
    }
}
