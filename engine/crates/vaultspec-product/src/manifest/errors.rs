use super::*;

impl std::fmt::Display for ManifestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Parse(message) => write!(f, "manifest parse failed: {message}"),
            Self::InputTooLarge {
                field,
                limit,
                found,
            } => {
                write!(f, "{field} is {found} bytes, above the {limit}-byte bound")
            }
            Self::InvalidField { field, detail } => write!(f, "invalid {field}: {detail}"),
            Self::FloatingSelector { field, value } => {
                write!(f, "floating selector in {field}: {value:?}")
            }
            Self::UnpinnedCommit { field, value } => {
                write!(f, "unpinned commit in {field}: {value:?}")
            }
            Self::MalformedDigest { field, value } => {
                write!(f, "malformed sha256 in {field}: {value:?}")
            }
            Self::TargetMismatch { expected, found } => write!(
                f,
                "target mismatch: expected {}, found {}",
                expected.triple(),
                found.triple()
            ),
            Self::DigestDrift {
                field,
                expected,
                found,
            } => {
                write!(
                    f,
                    "digest drift in {field}: expected {expected:?}, found {found:?}"
                )
            }
            Self::IdentityMismatch { detail } => write!(f, "identity mismatch: {detail}"),
            Self::MissingTargetPin { field, target } => {
                write!(f, "{field} has no pin for {}", target.triple())
            }
            Self::Io { path, detail } => write!(f, "I/O at {}: {detail}", path.display()),
            Self::UnsafeFileType { path, detail } => {
                write!(f, "unsafe file type at {}: {detail}", path.display())
            }
            Self::MissingFile(path) => write!(f, "installed payload is missing {path}"),
            Self::ExtraFile(path) => write!(f, "installed payload has undeclared file {path}"),
            Self::GenerationChanged { detail } => {
                write!(
                    f,
                    "unpublished generation changed during verification: {detail}"
                )
            }
            Self::SizeMismatch {
                path,
                expected,
                found,
            } => {
                write!(
                    f,
                    "size mismatch for {path}: expected {expected}, found {found}"
                )
            }
            Self::GenerationAuthority(error) => {
                write!(f, "unpublished generation authority rejected: {error}")
            }
        }
    }
}

impl std::error::Error for ManifestError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::GenerationAuthority(error) => Some(error),
            _ => None,
        }
    }
}

impl From<GenerationError> for ManifestError {
    fn from(error: GenerationError) -> Self {
        Self::GenerationAuthority(error)
    }
}
