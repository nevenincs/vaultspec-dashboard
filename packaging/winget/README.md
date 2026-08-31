# WinGet manifests

These are **authored-pending manifests, deliberately unpublishable**, and the
zeroed `InstallerSha256` in `vaultspec.vaultspec.installer.yaml` is
**load-bearing**. Do not "tidy" it away.

## What these manifests install

The same artefact Scoop installs: the composed product archive
`vaultspec-<version>-x86_64-pc-windows-msvc.zip`, whose contents are FLAT at the
archive root — `bin/vaultspec.exe`, `bin/vaultspec-updater.exe`,
`licenses/LICENSE`, `release.json`, `sbom.cdx.json`. `product-release.yml`
composes it and writes a sibling `.sha256` carrying a bare digest.

WinGet consumes it as `InstallerType: zip` +
`NestedInstallerType: portable`, with one `NestedInstallerFiles` entry
(`bin\vaultspec.exe`, `PortableCommandAlias: vaultspec`). That puts exactly one
command on PATH and leaves the rest of the tree extracted beside it, which is
what `vaultspec verify-release` needs. `vaultspec-updater.exe` is deliberately
not aliased.

## The MSI is gone, and could not have worked

These manifests used to declare `InstallerType: wix` against
`vaultspec-<version>-x86_64-pc-windows-msvc.msi`. **That MSI has never been
built and, as the tree stands, cannot be:**

- `engine/crates/vaultspec-cli/wix/main.wxs` opens with
  `<?ifndef ProductTreeDir ?><?error ...?>`, and nothing in the repository
  defines the `ProductTreeDir` preprocessor variable — the source `<?error?>`s
  before it can compile.
- Its component groups reference heat-harvested fragments (`LicenseFiles`) that
  no build step generates.
- No CI job invokes `candle`/`light` on it, and `dist-workspace.toml` sets
  `installers = []`.

So the previous manifest pointed at an artefact with no producer at all. The zip
has one. `ProductCode` was dropped with the MSI: it is a Windows Installer fact
and there is no Windows Installer package to have one.

## ManifestVersion: 1.6.0 is correct and needs no raise

`NestedInstallerType`, `NestedInstallerFiles`, `RelativeFilePath` and
`PortableCommandAlias` were **added in installer schema 1.4.0**. Checked
directly against the published schemas: `aka.ms/winget-manifest.installer.<v>.schema.json`
contains no `NestedInstallerType` at `1.1.0` or `1.2.0`, and does contain it at
`1.4.0`, `1.6.0` and `1.9.0`. All three manifests already declared `1.6.0`, so
the fields below are supported as-is.

Client-side, `InstallerType: zip` requires WinGet 1.5 or newer and
`portable` requires 1.3 — both documented in the 1.6.0 installer schema
reference.

## The zeroed digest is a sentinel

`a2a-channel-feasibility.yml` reads this directory and matches the zeros to fail
the channel closed:

```powershell
$installer = Get-Content packaging/winget/vaultspec.vaultspec.installer.yaml -Raw
if ($installer -match 'InstallerSha256:\s*"?0{64}') {
  Emit 'blocked' '...'
  exit 1
}
```

Deleting these files does not remove a placeholder; it removes the thing that
reports the channel is not ready, and replaces a clear `blocked` result with a
file-not-found error from a `Get-Content` several steps in.

**These manifests are unpublishable until that digest is filled with the real
SHA-256 of the archive named in `InstallerUrl`.** Sixty-four zeros is an
obviously-impossible digest, which is the point: it cannot be mistaken for a
real one, and it fails in our own gate rather than on a user's machine. Never
substitute a plausible-looking fake — a wrong-but-well-formed digest fails at
install time, where the zeros fail at authoring time.

## The remaining blocker

**No release has yet attached the composed product archive.** `PackageVersion`
is `0.1.10`, matched across all three manifests, and `InstallerUrl` names
`vaultspec-0.1.10-x86_64-pc-windows-msvc.zip` on tag `v0.1.10` — but the
published `v0.1.10` release carries only the Dist per-package archives
(`vaultspec-cli-*`, `vaultspec-product-*`, `vaultspec-updater-*`,
`vaultspec-release-verify-*`). The composed `vaultspec-<version>-<target>` archive
is produced by `product-release.yml` and has not landed on a release yet.

So the version and URL are reconciled at release time, from the archive that
publishes. Both are kept in sync by hand only so the manifest set stays
internally consistent — winget validation rejects a set whose three
`PackageVersion` values disagree.

Beyond the artefact, cross-repo publication (#46/#50 class) is a second
standing dependency: submission targets `microsoft/winget-pkgs` via a fork + PR
(komac/wingetcreate), which needs a fork and a token with access to it.

## Why this is not the old `bucket/` placeholder

It reads like the same defect and is the opposite one. The distinction is
whether a package manager can reach it.

|  | old in-repo `bucket/` (retired) | here |
| --- | --- | --- |
| Committed where a package manager reads it | **yes** — the repo was its own Scoop bucket | no |
| Published to a channel root | yes | **never** — `microsoft/winget-pkgs` is untouched |
| Effect of the placeholder | `scoop install` failed at download | a gate reports `blocked` |

That Scoop manifest was a **live pointer**: it named a version, pinned an empty
hash, and users acted on it. Scoop now publishes to the organisation tap
`nevenincs/homebrew-tap` instead, and `bucket/README.md` records that.

Nothing publishes these. `winget-publish.yml` has **never run** and ends in a
hard `Write-Error` refusal rather than a submission;
`a2a-channel-feasibility.yml` has **never run** either. So the digest here is
read only by our own gate, never by WinGet.

## The order things must happen in

Attach the composed archive to a release → fill the real `InstallerSha256` and
bump `PackageVersion`/`InstallerUrl` to that release → the sentinel above stops
matching → the feasibility gate can go green → wire a real komac/wingetcreate
submission into `winget-publish.yml` in place of its `Write-Error`. Until the
first of those, every step after it is correctly blocked.
