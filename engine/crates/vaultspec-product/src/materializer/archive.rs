//! The closed deterministic ZIP grammar and bounded preflight
//! (archive-materialization D1/D2, acceptance Refinement A).
//!
//! Parsing produces a bounded PLAN, never a filesystem effect. The parser is
//! hand-rolled because the profile is a closed grammar: comments, extra
//! fields, non-zero flags, encryption, unknown methods, ZIP64,
//! central/local disagreement, overlapping records, duplicate or
//! casefold-colliding paths, file/directory-prefix collisions, non-admitted
//! modes, and archive-supplied entry types other than regular files are all
//! REFUSED — a general-purpose ZIP reader tolerates exactly what this
//! profile forbids. The one admitted compressed stream is decoded through
//! `flate2` with counted output.
//!
//! CRC-32 fields participate only in the central/local byte-equality law;
//! entry content truth is SHA-256: preflight digests every decoded entry,
//! locates exactly one member manifest by the independently authenticated
//! digest, and proves the archive inventory equal to the trusted manifest
//! inventory before any generation content exists (D2). The complete
//! double-scan verification then re-proves the installed tree.

use std::collections::{BTreeMap, BTreeSet};
use std::io::{Read, Seek, SeekFrom};
use std::time::Instant;

use sha2::{Digest as _, Sha256};

use crate::manifest::{preflight_inventory, semantic_path_key, validate_portable_path};

use super::MaterializeError;

/// The ZIP32 end-of-central-directory entry-count field is sixteen bits, so
/// the closed grammar admits at most 65,535 entries (acceptance Refinement A).
/// The 100,000-file limits remain the generation-tree verifier's bounds.
pub(crate) const MAX_ARCHIVE_ENTRIES: usize = 65_535;
const MAX_CENTRAL_DIRECTORY_BYTES: u64 = 64 * 1024 * 1024;
const MAX_PATH_BYTES: usize = 4096;
const MAX_SEGMENTS: usize = 32;
const MAX_SEGMENT_BYTES: usize = 128;
const MAX_DERIVED_DIRECTORIES: usize = 100_000;
/// Total expanded bytes across every entry (mirrors the tree verifier bound).
const MAX_EXPANDED_BYTES: u64 = 8 * 1024 * 1024 * 1024;
/// Aggregate decompression-ratio bound: expanded may exceed compressed by at
/// most this factor plus a fixed slack floor for tiny archives.
const MAX_EXPANSION_FACTOR: u64 = 100;
const EXPANSION_SLACK_BYTES: u64 = 1024 * 1024;
/// The transaction-reserved sibling-name suffix is excluded from the archive
/// grammar (archive-materialization D5).
pub(crate) const RESERVED_TEMP_SUFFIX: &str = ".vsmz-tmp";

const EOCD_LEN: u64 = 22;
const CENTRAL_HEADER_LEN: usize = 46;
const LOCAL_HEADER_LEN: usize = 30;
const EOCD_SIGNATURE: u32 = 0x0605_4b50;
const CENTRAL_SIGNATURE: u32 = 0x0201_4b50;
const LOCAL_SIGNATURE: u32 = 0x0403_4b50;
/// Version-made-by high byte 3 = Unix, the only admitted mode carrier.
const MADE_BY_UNIX: u8 = 3;
const MODE_REGULAR_644: u32 = 0o100_644;
const MODE_REGULAR_755: u32 = 0o100_755;

/// The admitted compression methods.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Method {
    Store,
    Deflate,
}

/// One admitted regular-file entry of the closed plan.
#[derive(Debug, Clone)]
pub(crate) struct PlannedEntry {
    /// The validated rootless portable ASCII slash path.
    pub(crate) path: String,
    /// Whether the admitted release mode is `0755` (else `0644`).
    pub(crate) executable: bool,
    pub(crate) method: Method,
    /// The absolute archive offset of the entry's compressed bytes.
    pub(crate) data_offset: u64,
    pub(crate) compressed_size: u64,
    pub(crate) size: u64,
    /// SHA-256 of the decoded bytes, computed by preflight.
    pub(crate) sha256: String,
}

/// The bounded closed plan preflight produces. Order is the deterministic
/// central-directory order; archive order carries no authority beyond it.
#[derive(Debug)]
pub(crate) struct ArchivePlan {
    pub(crate) entries: Vec<PlannedEntry>,
    /// Index of the located member manifest within `entries`.
    pub(crate) manifest_index: usize,
    /// Every directory the accepted file paths derive, for the descriptor
    /// recovery resume and the tests' bound assertions.
    #[allow(
        dead_code,
        reason = "a plan fact consumed by tests now and by descriptor recovery (S53 resume) next"
    )]
    pub(crate) derived_directories: BTreeSet<String>,
}

fn grammar(detail: impl Into<String>) -> MaterializeError {
    MaterializeError::ArchiveGrammar(detail.into())
}

fn check_deadline(deadline: Instant) -> Result<(), MaterializeError> {
    if Instant::now() >= deadline {
        Err(MaterializeError::Deadline)
    } else {
        Ok(())
    }
}

fn u16le(bytes: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([bytes[at], bytes[at + 1]])
}

fn u32le(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
}

struct CentralEntry {
    path: String,
    executable: bool,
    method: Method,
    flags: u16,
    crc: u32,
    compressed_size: u64,
    size: u64,
    local_offset: u64,
    name_bytes: Vec<u8>,
}

/// Parse and prove the complete closed grammar, decode-and-digest every
/// entry, locate the one member manifest by the trusted digest, and prove the
/// archive inventory equal to the trusted manifest inventory.
pub(crate) fn preflight<R: Read + Seek>(
    reader: &mut R,
    archive_length: u64,
    member_manifest_sha256: &str,
    deadline: Instant,
) -> Result<ArchivePlan, MaterializeError> {
    check_deadline(deadline)?;
    if archive_length < EOCD_LEN {
        return Err(grammar("archive is smaller than one end record"));
    }

    // The end record sits EXACTLY at the tail: comments are refused, so a
    // trailing-junk or prepended-junk archive cannot parse.
    let mut eocd = [0u8; EOCD_LEN as usize];
    reader
        .seek(SeekFrom::Start(archive_length - EOCD_LEN))
        .and_then(|_| reader.read_exact(&mut eocd))
        .map_err(|error| MaterializeError::io("archive end-record read", error))?;
    if u32le(&eocd, 0) != EOCD_SIGNATURE {
        return Err(grammar("missing end-of-central-directory record"));
    }
    if u16le(&eocd, 4) != 0 || u16le(&eocd, 6) != 0 {
        return Err(grammar("multi-disk archives are refused"));
    }
    let entry_count = u16le(&eocd, 8);
    if entry_count != u16le(&eocd, 10) {
        return Err(grammar("disk entry count disagrees with total"));
    }
    let entry_count = usize::from(entry_count);
    let central_size = u64::from(u32le(&eocd, 12));
    let central_offset = u64::from(u32le(&eocd, 16));
    if u16le(&eocd, 20) != 0 {
        return Err(grammar("archive comments are refused"));
    }
    if entry_count == 0 || entry_count > MAX_ARCHIVE_ENTRIES {
        return Err(grammar("entry count is zero or over the closed bound"));
    }
    if central_size > MAX_CENTRAL_DIRECTORY_BYTES
        || central_size < (entry_count as u64) * (CENTRAL_HEADER_LEN as u64)
    {
        return Err(grammar("central directory size is out of bounds"));
    }
    if central_offset
        .checked_add(central_size)
        .and_then(|end| end.checked_add(EOCD_LEN))
        != Some(archive_length)
    {
        return Err(grammar(
            "central directory does not exactly precede the end record",
        ));
    }

    let mut central = vec![0u8; central_size as usize];
    reader
        .seek(SeekFrom::Start(central_offset))
        .and_then(|_| reader.read_exact(&mut central))
        .map_err(|error| MaterializeError::io("central directory read", error))?;

    // Pass 1: the central directory in full, within fixed bounds.
    let mut entries = Vec::with_capacity(entry_count);
    let mut cursor = 0usize;
    let mut total_expanded = 0u64;
    let mut total_compressed = 0u64;
    for _ in 0..entry_count {
        check_deadline(deadline)?;
        if central.len() < cursor + CENTRAL_HEADER_LEN {
            return Err(grammar("central directory truncated"));
        }
        let header = &central[cursor..cursor + CENTRAL_HEADER_LEN];
        if u32le(header, 0) != CENTRAL_SIGNATURE {
            return Err(grammar("central header signature mismatch"));
        }
        let made_by = header[5];
        if made_by != MADE_BY_UNIX {
            return Err(grammar("central header carrier is not the Unix mode form"));
        }
        if u16le(header, 6) > 20 {
            return Err(grammar("version-needed exceeds the deflate profile"));
        }
        let flags = u16le(header, 8);
        if flags != 0 {
            return Err(grammar(
                "general-purpose flags are refused (no encryption, descriptors, or UTF-8 flagging)",
            ));
        }
        let method = match u16le(header, 10) {
            0 => Method::Store,
            8 => Method::Deflate,
            _ => return Err(grammar("compression method outside Store/Deflate")),
        };
        // Archive timestamps carry no authority and are required zero.
        if u16le(header, 12) != 0 || u16le(header, 14) != 0 {
            return Err(grammar("archive timestamps are refused"));
        }
        let crc = u32le(header, 16);
        let compressed_size = u64::from(u32le(header, 20));
        let size = u64::from(u32le(header, 24));
        let name_len = usize::from(u16le(header, 28));
        if u16le(header, 30) != 0 || u16le(header, 32) != 0 {
            return Err(grammar("extra fields and entry comments are refused"));
        }
        if u16le(header, 34) != 0 {
            return Err(grammar("multi-disk entries are refused"));
        }
        if u16le(header, 36) != 0 {
            return Err(grammar("internal attributes are refused"));
        }
        let external = u32le(header, 38);
        if external & 0xffff != 0 {
            return Err(grammar("DOS attribute bits are refused"));
        }
        let executable = match external >> 16 {
            MODE_REGULAR_644 => false,
            MODE_REGULAR_755 => true,
            _ => {
                return Err(grammar(
                    "entry is not a regular file with an admitted release mode",
                ));
            }
        };
        let local_offset = u64::from(u32le(header, 42));
        if name_len == 0 || name_len > MAX_PATH_BYTES {
            return Err(grammar("entry path length is out of bounds"));
        }
        if central.len() < cursor + CENTRAL_HEADER_LEN + name_len {
            return Err(grammar("central directory truncated inside a name"));
        }
        let name_bytes =
            central[cursor + CENTRAL_HEADER_LEN..cursor + CENTRAL_HEADER_LEN + name_len].to_vec();
        cursor += CENTRAL_HEADER_LEN + name_len;

        if !name_bytes.iter().all(|byte| (0x20..0x7f).contains(byte)) {
            return Err(grammar("entry path is not printable ASCII"));
        }
        let path = String::from_utf8(name_bytes.clone())
            .map_err(|_| grammar("entry path is not UTF-8"))?;
        validate_entry_path(&path)?;

        // Size class: ZIP64 is refused, so the 32-bit sentinel is malformed.
        if compressed_size == u64::from(u32::MAX) || size == u64::from(u32::MAX) {
            return Err(grammar("ZIP64 size sentinels are refused"));
        }
        if method == Method::Store && compressed_size != size {
            return Err(grammar("stored entry sizes disagree"));
        }
        total_expanded = total_expanded
            .checked_add(size)
            .filter(|total| *total <= MAX_EXPANDED_BYTES)
            .ok_or_else(|| grammar("expanded bytes exceed the fixed bound"))?;
        total_compressed = total_compressed
            .checked_add(compressed_size)
            .ok_or_else(|| grammar("compressed byte total overflow"))?;

        entries.push(CentralEntry {
            path,
            executable,
            method,
            flags,
            crc,
            compressed_size,
            size,
            local_offset,
            name_bytes,
        });
    }
    if cursor != central.len() {
        return Err(grammar("central directory carries trailing bytes"));
    }
    if total_expanded
        > total_compressed
            .saturating_mul(MAX_EXPANSION_FACTOR)
            .saturating_add(EXPANSION_SLACK_BYTES)
    {
        return Err(grammar("aggregate expansion ratio exceeds the bound"));
    }

    // Collisions over the whole normalized inventory. Archive order has no
    // authority: the collision law binds on the set.
    let mut by_path: BTreeMap<&str, usize> = BTreeMap::new();
    let mut semantic = BTreeSet::new();
    let mut derived_directories = BTreeSet::new();
    for (index, entry) in entries.iter().enumerate() {
        if by_path.insert(entry.path.as_str(), index).is_some() {
            return Err(grammar("duplicate entry path"));
        }
        if !semantic.insert(semantic_path_key(&entry.path)) {
            return Err(grammar("ASCII-casefold duplicate entry path"));
        }
        let mut prefix = String::new();
        for segment in entry.path.split('/') {
            if !prefix.is_empty() {
                derived_directories.insert(prefix.clone());
                prefix.push('/');
            }
            prefix.push_str(segment);
        }
    }
    if derived_directories.len() > MAX_DERIVED_DIRECTORIES {
        return Err(grammar("derived directory count exceeds the bound"));
    }
    for directory in &derived_directories {
        if by_path.contains_key(directory.as_str())
            || !semantic.insert(semantic_path_key(directory))
        {
            return Err(grammar("file/directory prefix collision"));
        }
    }

    // Pass 2: every local header must agree byte-for-byte with its central
    // record, and data ranges must be ascending, non-overlapping, and end
    // before the central directory.
    let mut order: Vec<usize> = (0..entries.len()).collect();
    order.sort_by_key(|index| entries[*index].local_offset);
    let mut previous_end = 0u64;
    let mut data_offsets = vec![0u64; entries.len()];
    for index in order {
        check_deadline(deadline)?;
        let entry = &entries[index];
        if entry.local_offset < previous_end {
            return Err(grammar("overlapping or duplicated entry records"));
        }
        let mut header = [0u8; LOCAL_HEADER_LEN];
        reader
            .seek(SeekFrom::Start(entry.local_offset))
            .and_then(|_| reader.read_exact(&mut header))
            .map_err(|error| MaterializeError::io("local header read", error))?;
        if u32le(&header, 0) != LOCAL_SIGNATURE {
            return Err(grammar("local header signature mismatch"));
        }
        if u16le(&header, 4) > 20
            || u16le(&header, 6) != entry.flags
            || u16le(&header, 8)
                != match entry.method {
                    Method::Store => 0,
                    Method::Deflate => 8,
                }
            || u16le(&header, 10) != 0
            || u16le(&header, 12) != 0
            || u32le(&header, 14) != entry.crc
            || u64::from(u32le(&header, 18)) != entry.compressed_size
            || u64::from(u32le(&header, 22)) != entry.size
            || usize::from(u16le(&header, 26)) != entry.name_bytes.len()
            || u16le(&header, 28) != 0
        {
            return Err(grammar("local header disagrees with the central record"));
        }
        let mut name = vec![0u8; entry.name_bytes.len()];
        reader
            .read_exact(&mut name)
            .map_err(|error| MaterializeError::io("local name read", error))?;
        if name != entry.name_bytes {
            return Err(grammar(
                "local entry name disagrees with the central record",
            ));
        }
        let data_offset =
            entry.local_offset + LOCAL_HEADER_LEN as u64 + entry.name_bytes.len() as u64;
        let end = data_offset
            .checked_add(entry.compressed_size)
            .ok_or_else(|| grammar("entry data range overflow"))?;
        if end > central_offset {
            return Err(grammar("entry data overlaps the central directory"));
        }
        data_offsets[index] = data_offset;
        previous_end = end;
    }

    // Pass 3: counted decode + SHA-256 of every entry; locate exactly one
    // member manifest by the independently authenticated digest.
    let mut planned = Vec::with_capacity(entries.len());
    let mut manifest_index: Option<usize> = None;
    for (index, entry) in entries.iter().enumerate() {
        check_deadline(deadline)?;
        reader
            .seek(SeekFrom::Start(data_offsets[index]))
            .map_err(|error| MaterializeError::io("entry data seek", error))?;
        let digest = decode_digest(
            reader,
            entry.method,
            entry.compressed_size,
            entry.size,
            deadline,
        )?;
        if digest == member_manifest_sha256 && manifest_index.replace(index).is_some() {
            return Err(grammar(
                "more than one entry matches the trusted member-manifest digest",
            ));
        }
        planned.push(PlannedEntry {
            path: entry.path.clone(),
            executable: entry.executable,
            method: entry.method,
            data_offset: data_offsets[index],
            compressed_size: entry.compressed_size,
            size: entry.size,
            sha256: digest,
        });
    }
    let manifest_index = manifest_index.ok_or_else(|| {
        MaterializeError::ManifestInventory(
            "no entry matches the trusted member-manifest digest".to_string(),
        )
    })?;

    // Retain and parse the located manifest, then prove inventory equality
    // (D2): every non-manifest entry is declared with the exact digest, and
    // nothing declared is absent.
    reader
        .seek(SeekFrom::Start(planned[manifest_index].data_offset))
        .map_err(|error| MaterializeError::io("manifest data seek", error))?;
    let manifest_bytes = decode_retained(
        reader,
        planned[manifest_index].method,
        planned[manifest_index].compressed_size,
        planned[manifest_index].size,
        deadline,
    )?;
    let inventory = preflight_inventory(&manifest_bytes)
        .map_err(|error| MaterializeError::ManifestInventory(error.to_string()))?;
    if inventory.manifest_path != planned[manifest_index].path {
        return Err(MaterializeError::ManifestInventory(
            "the located manifest declares a different self path".to_string(),
        ));
    }
    for entry in &planned {
        if entry.path == inventory.manifest_path {
            continue;
        }
        match inventory.file_digests.get(&entry.path) {
            Some(expected) if *expected == entry.sha256 => {}
            Some(_) => {
                return Err(MaterializeError::ManifestInventory(format!(
                    "archive entry {} disagrees with the trusted manifest digest",
                    entry.path
                )));
            }
            None => {
                return Err(MaterializeError::ManifestInventory(format!(
                    "archive entry {} is not in the trusted manifest inventory",
                    entry.path
                )));
            }
        }
    }
    // planned has unique paths, so equality of counts proves nothing missing.
    if inventory.file_digests.len() != planned.len() - 1 {
        return Err(MaterializeError::ManifestInventory(
            "trusted manifest declares files the archive does not carry".to_string(),
        ));
    }

    Ok(ArchivePlan {
        entries: planned,
        manifest_index,
        derived_directories,
    })
}

fn validate_entry_path(path: &str) -> Result<(), MaterializeError> {
    validate_portable_path("archive entry", path).map_err(|error| grammar(error.to_string()))?;
    let segments: Vec<&str> = path.split('/').collect();
    if segments.len() > MAX_SEGMENTS {
        return Err(grammar("entry path exceeds the segment-depth bound"));
    }
    for segment in &segments {
        if segment.len() > MAX_SEGMENT_BYTES {
            return Err(grammar("entry path segment exceeds the byte bound"));
        }
    }
    let leaf = segments.last().copied().unwrap_or_default();
    if leaf.ends_with(RESERVED_TEMP_SUFFIX) {
        return Err(grammar(
            "the transaction-reserved temporary suffix is excluded from the grammar",
        ));
    }
    Ok(())
}

/// A bounded reader over one entry's DECODED bytes, for the write pass. The
/// writer counts and digests output independently; this only supplies bytes.
pub(crate) fn entry_reader<'a, R: Read>(
    input: &'a mut R,
    method: Method,
    compressed_size: u64,
) -> Box<dyn Read + 'a> {
    let bounded = input.take(compressed_size);
    match method {
        Method::Store => Box::new(bounded),
        Method::Deflate => Box::new(flate2::read::DeflateDecoder::new(bounded)),
    }
}

fn decode_digest<R: Read>(
    input: &mut R,
    method: Method,
    compressed_size: u64,
    expected_size: u64,
    deadline: Instant,
) -> Result<String, MaterializeError> {
    let mut decoded = entry_reader(input, method, compressed_size);
    let mut hasher = Sha256::new();
    let mut produced = 0u64;
    let mut chunk = [0u8; 64 * 1024];
    loop {
        check_deadline(deadline)?;
        let read = decoded
            .read(&mut chunk)
            .map_err(|error| MaterializeError::io("entry decode", error))?;
        if read == 0 {
            break;
        }
        produced += read as u64;
        if produced > expected_size {
            return Err(grammar("decoded bytes exceed the declared size"));
        }
        hasher.update(&chunk[..read]);
    }
    if produced != expected_size {
        return Err(grammar("decoded bytes fall short of the declared size"));
    }
    Ok(hex_lower(&hasher.finalize()))
}

fn decode_retained<R: Read>(
    input: &mut R,
    method: Method,
    compressed_size: u64,
    expected_size: u64,
    deadline: Instant,
) -> Result<Vec<u8>, MaterializeError> {
    let mut decoded = entry_reader(input, method, compressed_size);
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 64 * 1024];
    loop {
        check_deadline(deadline)?;
        let read = decoded
            .read(&mut chunk)
            .map_err(|error| MaterializeError::io("manifest decode", error))?;
        if read == 0 {
            break;
        }
        if bytes.len() as u64 + read as u64 > expected_size {
            return Err(grammar("decoded manifest exceeds its declared size"));
        }
        bytes.extend_from_slice(&chunk[..read]);
    }
    if bytes.len() as u64 != expected_size {
        return Err(grammar("decoded manifest falls short of its declared size"));
    }
    Ok(bytes)
}

pub(crate) fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut value = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        value.push(char::from(HEX[usize::from(byte >> 4)]));
        value.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    value
}
