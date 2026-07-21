//! Lowercase hex encoding — the crate's one implementation.
//!
//! Digests cross this crate as lowercase hex text in manifests, locks, cohort
//! descriptors, receipts, and snapshots, and every one of those is compared as
//! a string. A second encoder that differed in case would silently fail every
//! such comparison, so there is exactly one here.

use sha2::{Digest as _, Sha256};

const HEX: &[u8; 16] = b"0123456789abcdef";

/// Lowercase hex of arbitrary bytes.
pub(crate) fn encode(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(char::from(HEX[usize::from(byte >> 4)]));
        encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    encoded
}

/// Lowercase hex of the SHA-256 of `bytes` — the digest form every manifest,
/// lock, cohort, receipt, and snapshot field carries.
pub(crate) fn sha256(bytes: &[u8]) -> String {
    encode(&Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encoding_is_lowercase_and_zero_padded() {
        assert_eq!(encode(&[]), "");
        assert_eq!(encode(&[0x00, 0x0f, 0xa5, 0xff]), "000fa5ff");
    }

    #[test]
    fn sha256_matches_the_known_empty_digest() {
        assert_eq!(
            sha256(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
