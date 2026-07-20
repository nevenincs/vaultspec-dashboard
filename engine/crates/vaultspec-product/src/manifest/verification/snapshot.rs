use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

#[derive(PartialEq, Eq)]
pub(in crate::manifest) struct ObservedFile {
    pub(super) identity: FilesystemIdentity,
    pub(super) owner: Option<u32>,
    pub(super) link_count: u64,
    pub(in crate::manifest) size: u64,
    pub(super) digest: String,
    pub(super) normalized_mode: Option<&'static str>,
}

impl ObservedFile {
    pub(super) fn semantically_matches(&self, candidate: &Self) -> bool {
        self.owner == candidate.owner
            && self.link_count == candidate.link_count
            && self.size == candidate.size
            && self.digest == candidate.digest
            && self.normalized_mode == candidate.normalized_mode
    }
}

pub(in crate::manifest) struct GenerationSnapshot {
    pub(super) canonical_root: PathBuf,
    pub(super) root_identity: RootIdentity,
    pub(super) directories: BTreeMap<String, ObservedDirectory>,
    pub(in crate::manifest) files: BTreeMap<String, ObservedFile>,
}

impl PartialEq for GenerationSnapshot {
    fn eq(&self, other: &Self) -> bool {
        self.canonical_root == other.canonical_root
            && self.root_identity == other.root_identity
            && same_semantic_directories(&self.directories, &other.directories)
            && same_semantic_files(&self.files, &other.files)
    }
}

impl Eq for GenerationSnapshot {}

#[derive(PartialEq, Eq)]
pub(super) struct ObservedDirectory {
    pub(super) identity: FilesystemIdentity,
    pub(super) owner: Option<u32>,
    pub(super) mode: Option<u32>,
}

fn same_semantic_directories(
    initial: &BTreeMap<String, ObservedDirectory>,
    current: &BTreeMap<String, ObservedDirectory>,
) -> bool {
    initial.len() == current.len()
        && initial.iter().all(|(path, observed)| {
            current.get(path).is_some_and(|candidate| {
                observed.owner == candidate.owner && observed.mode == candidate.mode
            })
        })
}

fn same_semantic_files(
    initial: &BTreeMap<String, ObservedFile>,
    current: &BTreeMap<String, ObservedFile>,
) -> bool {
    initial.len() == current.len()
        && initial.iter().all(|(path, observed)| {
            current
                .get(path)
                .is_some_and(|candidate| observed.semantically_matches(candidate))
        })
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum RootIdentity {
    #[cfg(unix)]
    Unix { device: u64, inode: u64 },
    #[cfg(windows)]
    Windows {
        volume_serial_number: u64,
        file_id: u128,
    },
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum FilesystemIdentity {
    #[cfg(unix)]
    Unix { device: u64, inode: u64 },
    #[cfg(windows)]
    Windows {
        volume_serial_number: u64,
        file_id: u128,
    },
}

pub(super) fn record_file_parent_directories(path: &str, parents: &mut BTreeSet<String>) {
    let mut remaining = path;
    while let Some((parent, _)) = remaining.rsplit_once('/') {
        parents.insert(parent.to_string());
        remaining = parent;
    }
}
