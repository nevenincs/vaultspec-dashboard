//! Inventory verb adapters: `vault list`, `vault stats`,
//! `vault feature list` (engine-spec §5.1 — primary verbs for inventory
//! and the `/status` health passthrough).

use std::collections::BTreeMap;

use serde::Deserialize;

use crate::runner::{CoreError, Result};

pub const LIST_SCHEMA: &str = "vaultspec.vault.list.v1";
pub const STATS_SCHEMA: &str = "vaultspec.vault.stats.v1";
pub const FEATURE_LIST_SCHEMA: &str = "vaultspec.vault.feature.list.v1";

/// One vault document from `vault list`.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct DocumentInfo {
    pub name: String,
    pub doc_type: String,
    #[serde(default)]
    pub feature: Option<String>,
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// `vault stats` rollup.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct VaultStats {
    pub total_docs: u64,
    pub total_features: u64,
    #[serde(default)]
    pub counts_by_type: BTreeMap<String, u64>,
    #[serde(default)]
    pub orphaned_count: u64,
    #[serde(default)]
    pub dangling_link_count: u64,
}

/// One feature from `vault feature list`.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct FeatureInfo {
    pub name: String,
    pub doc_count: u64,
    #[serde(default)]
    pub types: Vec<String>,
    #[serde(default)]
    pub earliest_date: Option<String>,
    #[serde(default)]
    pub has_plan: bool,
}

#[derive(Debug, Deserialize)]
struct ListData {
    documents: Vec<DocumentInfo>,
}

#[derive(Debug, Deserialize)]
struct FeatureListData {
    features: Vec<FeatureInfo>,
}

/// Parse a pinned `vault list` `data` payload.
pub fn parse_list(data: &serde_json::Value) -> Result<Vec<DocumentInfo>> {
    let parsed: ListData = serde_json::from_value(data.clone()).map_err(CoreError::Json)?;
    Ok(parsed.documents)
}

/// Parse a pinned `vault stats` `data` payload.
pub fn parse_stats(data: &serde_json::Value) -> Result<VaultStats> {
    serde_json::from_value(data.clone()).map_err(CoreError::Json)
}

/// Parse a pinned `vault feature list` `data` payload.
pub fn parse_feature_list(data: &serde_json::Value) -> Result<Vec<FeatureInfo>> {
    let parsed: FeatureListData = serde_json::from_value(data.clone()).map_err(CoreError::Json)?;
    Ok(parsed.features)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_stats_payload() {
        let data = serde_json::json!({
            "total_docs": 26, "total_features": 3,
            "counts_by_type": {"adr": 3, "exec": 14},
            "orphaned_count": 0, "dangling_link_count": 0
        });
        let stats = parse_stats(&data).unwrap();
        assert_eq!(stats.total_docs, 26);
        assert_eq!(stats.counts_by_type["exec"], 14);
    }
}
