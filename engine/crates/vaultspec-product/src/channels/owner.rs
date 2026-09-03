//! Which package manager, if any, owns the files of a running copy.
//!
//! This answers a different question from the rest of this module. The channel
//! adapters mint a SEALED provenance for an operation the product is about to
//! delegate; this asks, of a copy already on disk, whether some manager owns
//! its files and so owns its updates.
//!
//! It exists because nothing records that fact at install time. A manager
//! install unpacks the complete release tree and writes no receipt, so there is
//! no sealed provenance to consult — `Channel::Scoop` is minted only when the
//! product delegates an operation, never when Scoop places the files. Until an
//! install path records its own channel, the only evidence available is the
//! layout the manager put the copy in.
//!
//! Because the answer gates a refusal, every rule here is CORROBORATED against
//! the filesystem rather than matched on a name alone. A false positive refuses
//! an update the product owns and is supposed to perform; a false negative only
//! returns today's behaviour. The rules are therefore deliberately narrow, and
//! each one requires a directory that only that manager's layout produces.

use std::path::Path;

/// A package manager that owns an installed copy's files, and therefore its
/// updates.
///
/// Deliberately NOT [`crate::receipt::Channel`]. That enum is the sealed
/// provenance of a delegated operation and its variants are load-bearing for
/// receipt serialization; this is an observation about a directory layout, and
/// conflating the two would let a path heuristic reach the sealed model.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagerOwner {
    /// Installed by Scoop, under `<scoop root>/apps/<app>/<version>/`.
    Scoop,
    /// Installed by Homebrew, under `<prefix>/Cellar/<formula>/<version>/`.
    Homebrew,
    /// Installed by WinGet, under its packages directory.
    WinGet,
}

impl ManagerOwner {
    /// The manager that owns `exe`, if the layout around it is that manager's
    /// own and the corroborating directory is present.
    ///
    /// `None` means no manager layout was recognised — which includes every
    /// product-owned self-install, so the caller keeps its existing behaviour.
    #[must_use]
    pub fn detect(exe: &Path) -> Option<Self> {
        Self::detect_with(exe, |p| p.is_dir())
    }

    /// [`Self::detect`] with the directory probe supplied, so the rules can be
    /// exercised against a constructed layout.
    #[must_use]
    pub fn detect_with(exe: &Path, is_dir: impl Fn(&Path) -> bool) -> Option<Self> {
        // Homebrew: `<prefix>/Cellar/<formula>/<version>/libexec/bin/vaultspec`.
        // `Cellar` is Homebrew's own directory name and appears in no other
        // layout the product ships into; requiring it to BE a directory keeps a
        // path that merely contains the word from matching.
        for ancestor in exe.ancestors() {
            if ancestor.file_name().is_some_and(|n| n == "Cellar") && is_dir(ancestor) {
                return Some(Self::Homebrew);
            }
        }

        // Scoop: `<scoop root>/apps/<app>/<version>/...`. `apps` alone is far
        // too common, so the corroboration is `shims` beside it — Scoop creates
        // both at its root and the pair does not occur incidentally.
        for ancestor in exe.ancestors() {
            if ancestor.file_name().is_some_and(|n| n == "apps")
                && let Some(root) = ancestor.parent()
                && is_dir(&root.join("shims"))
            {
                return Some(Self::Scoop);
            }
        }

        // WinGet: `…/Microsoft/WinGet/Packages/<package>/…`. The three-segment
        // run is the corroboration; `WinGet` alone could be anything.
        for ancestor in exe.ancestors() {
            if ancestor.file_name().is_some_and(|n| n == "Packages") {
                let winget = ancestor.parent();
                let microsoft = winget.and_then(Path::parent);
                let matches = winget.is_some_and(|p| p.file_name().is_some_and(|n| n == "WinGet"))
                    && microsoft.is_some_and(|p| p.file_name().is_some_and(|n| n == "Microsoft"));
                if matches && is_dir(ancestor) {
                    return Some(Self::WinGet);
                }
            }
        }

        None
    }

    /// The manager's own name, for a message a person reads.
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            Self::Scoop => "Scoop",
            Self::Homebrew => "Homebrew",
            Self::WinGet => "WinGet",
        }
    }

    /// The command that updates a copy this manager owns.
    ///
    /// One implementation: the CLI's refusal and any other caller name the same
    /// command, so a manager cannot be described two ways in two places.
    #[must_use]
    pub fn update_command(self) -> &'static str {
        match self {
            Self::Scoop => "scoop update vaultspec",
            Self::Homebrew => "brew upgrade vaultspec",
            Self::WinGet => "winget upgrade vaultspec",
        }
    }

    /// The whole refusal a caller reports, naming the manager and its command.
    #[must_use]
    pub fn refusal(self) -> String {
        format!(
            "this copy's files are owned by {}, which owns its updates too; \
             updating in place would rewrite files {} manages and leave its \
             records disagreeing with what is on disk — update it with `{}`",
            self.label(),
            self.label(),
            self.update_command(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::path::PathBuf;

    /// A layout of directories that exist, so the corroboration each rule makes
    /// is exercised against a real answer rather than assumed.
    fn layout(dirs: &[&str]) -> impl Fn(&Path) -> bool {
        let set: HashSet<PathBuf> = dirs.iter().map(PathBuf::from).collect();
        move |p: &Path| set.contains(p)
    }

    #[test]
    fn homebrew_cellar_is_owned() {
        let exe = Path::new("/opt/homebrew/Cellar/vaultspec/0.1.12/libexec/bin/vaultspec");
        let owner = ManagerOwner::detect_with(exe, layout(&["/opt/homebrew/Cellar"]));
        assert_eq!(owner, Some(ManagerOwner::Homebrew));
        assert_eq!(owner.unwrap().update_command(), "brew upgrade vaultspec");
    }

    #[test]
    fn scoop_apps_beside_shims_is_owned() {
        let exe = Path::new("/home/u/scoop/apps/vaultspec/0.1.12/bin/vaultspec.exe");
        let owner = ManagerOwner::detect_with(exe, layout(&["/home/u/scoop/shims"]));
        assert_eq!(owner, Some(ManagerOwner::Scoop));
        assert_eq!(owner.unwrap().update_command(), "scoop update vaultspec");
    }

    #[test]
    fn winget_packages_run_is_owned() {
        let exe = Path::new("/u/AppData/Local/Microsoft/WinGet/Packages/vaultspec/vaultspec.exe");
        let owner =
            ManagerOwner::detect_with(exe, layout(&["/u/AppData/Local/Microsoft/WinGet/Packages"]));
        assert_eq!(owner, Some(ManagerOwner::WinGet));
    }

    /// The refusal is only correct if it never fires on the copies the product
    /// DOES own. Each of these is one corroboration away from a match, which is
    /// exactly where a name-only rule would have gone wrong.
    #[test]
    fn product_owned_layouts_are_not_owned_by_a_manager() {
        // A self-install: no manager directory anywhere.
        assert_eq!(
            ManagerOwner::detect_with(
                Path::new("/home/u/.vaultspec/releases/0.1.12/bin/vaultspec"),
                layout(&[]),
            ),
            None,
        );
        // An `apps` component with no `shims` beside it - `apps` is far too
        // common a directory name to act on by itself.
        assert_eq!(
            ManagerOwner::detect_with(Path::new("/srv/apps/vaultspec/bin/vaultspec"), layout(&[]),),
            None,
        );
        // `Packages` that is not under `Microsoft/WinGet`.
        assert_eq!(
            ManagerOwner::detect_with(
                Path::new("/opt/Packages/vaultspec/vaultspec"),
                layout(&["/opt/Packages"]),
            ),
            None,
        );
        // A path that merely CONTAINS the word Cellar without it being the
        // directory Homebrew makes.
        assert_eq!(
            ManagerOwner::detect_with(
                Path::new("/home/u/CellarDoor/vaultspec/bin/vaultspec"),
                layout(&[]),
            ),
            None,
        );
    }

    /// Every variant names a manager and a command; a refusal that could not
    /// tell the reader what to run instead would be worse than none.
    #[test]
    fn every_owner_names_its_manager_and_command() {
        for owner in [
            ManagerOwner::Scoop,
            ManagerOwner::Homebrew,
            ManagerOwner::WinGet,
        ] {
            assert!(!owner.label().is_empty());
            assert!(owner.update_command().contains("vaultspec"));
            assert!(owner.refusal().contains(owner.update_command()));
            assert!(owner.refusal().contains(owner.label()));
        }
    }
}
