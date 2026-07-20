use super::*;

impl std::fmt::Display for GenerationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Path(error) => write!(f, "generation path refused: {error}"),
            Self::LockAuthority(error) => write!(f, "installation authority rejected: {error}"),
            Self::ActiveReceiptAuthority(error) => {
                write!(f, "active receipt authority rejected: {error}")
            }
            Self::ReceiptRecoveryRequired => {
                write!(
                    f,
                    "active receipt recovery must complete before generation mutation"
                )
            }
            Self::AlreadyExists(generation) => {
                write!(f, "generation {generation:?} already exists")
            }
            Self::AbandonedGenerationLimit { limit } => write!(
                f,
                "refusing generation creation at the nonactive-generation limit ({limit})"
            ),
            Self::ActiveGenerationMissing(generation) => write!(
                f,
                "settled active generation {generation:?} is not exactly present"
            ),
            Self::UnsafeFilesystemObject(path) => write!(
                f,
                "unsafe filesystem object at generation authority path {path:?}"
            ),
            Self::ParentIdentityChanged => {
                write!(f, "retained product directory relationship changed")
            }
            Self::AppHomeAuthorityTransition => write!(
                f,
                "app-home directory authority is in a fail-closed installation transition"
            ),
            Self::RootAuthorityMaterializing => write!(
                f,
                "generation root authority is leased to the archive materializer"
            ),
            Self::IdentityChanged(generation) => {
                write!(f, "generation {generation:?} filesystem identity changed")
            }
            Self::SelectedByActiveReceipt(generation) => write!(
                f,
                "active receipt selects generation {generation:?}; mutation refused"
            ),
            Self::CreationStage { stage, error } => {
                write!(f, "generation creation failed during {stage}: {error}")
            }
            Self::CreationValidation {
                validation,
                cleanup,
            } => write!(
                f,
                "created generation validation failed ({validation}); exact cleanup also failed ({cleanup})"
            ),
            Self::IndeterminateCreation { creation, cleanup } => write!(
                f,
                "generation creation authority is indeterminate ({creation}); identity-safe cleanup was incomplete ({cleanup})"
            ),
            Self::Io(error) => write!(f, "generation filesystem error: {error}"),
        }
    }
}

impl std::error::Error for GenerationError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Path(error) => Some(error),
            Self::LockAuthority(error) => Some(error),
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<PathError> for GenerationError {
    fn from(error: PathError) -> Self {
        Self::Path(error)
    }
}

impl From<LockAuthorityError> for GenerationError {
    fn from(error: LockAuthorityError) -> Self {
        Self::LockAuthority(error)
    }
}

impl From<std::io::Error> for GenerationError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

#[cfg(unix)]
impl From<rustix::io::Errno> for GenerationError {
    fn from(error: rustix::io::Errno) -> Self {
        Self::Io(error.into())
    }
}
