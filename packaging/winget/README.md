# WinGet manifests

These are **authored-pending manifests, deliberately unpublishable**, and the
zeroed `InstallerSha256` in `vaultspec.vaultspec.installer.yaml` is **load-bearing**.
Do not "tidy" it away.

## The zeroed digest is a sentinel

`a2a-channel-feasibility.yml` reads this directory and matches the zeros to fail
the channel closed:

```powershell
$installer = Get-Content packaging/winget/vaultspec.vaultspec.installer.yaml -Raw
if ($installer -match 'InstallerSha256:\s*"?0{64}') {
  Emit 'blocked' 'complete product MSI not yet built (WiX deferred) — winget authored-pending-MSI'
  exit 1
}
```

Deleting these files does not remove a placeholder; it removes the thing that
reports the channel is not ready, and replaces a clear `blocked` result with a
file-not-found error from a `Get-Content` several steps in.

## Why this is not the `bucket/` placeholder

It reads like the same defect and is the opposite one. The distinction is
whether a package manager can reach it.

|  | `bucket/` (removed) | here |
| --- | --- | --- |
| Committed where a package manager reads it | **yes** — the repo was its own Scoop bucket | no |
| Published to a channel root | yes | **never** — `nevenincs/winget-pkgs` is untouched |
| Effect of the placeholder | `scoop install` failed at download | a gate reports `blocked` |

The Scoop manifest was a **live pointer**: it named a version, pinned an empty
hash, and users acted on it. That is why it was removed, and `bucket/README.md`
records the reasoning at length.

Nothing publishes these. `winget-publish.yml` has **never run** and ends in a
hard `Write-Error` placeholder rather than a submission;
`a2a-channel-feasibility.yml` has **never run** either. So the digest here is
read only by our own gate, never by WinGet.

## What has to be true before this channel ships

**No MSI has ever been built.** `dist-workspace.toml` sets `installers = []`,
and no release from v0.1.0 to v0.1.7 carries a `.msi` — checked against every
published release. WiX is not on the build box, which is why the MSI is
deferred rather than merely missing.

`InstallerUrl` therefore names a file that has never existed, and
`PackageVersion: 0.1.2` is the version that was current when these were
authored. Both are reconciled at release time, from the MSI that publishes;
neither is worth updating by hand in the meantime, because a version bump
without an artifact only makes the file look more credible than it is.

The order is: build the MSI → attach it to a release → the sentinel above stops
matching → the feasibility gate can go green → wire a real submission into
`winget-publish.yml` in place of its `Write-Error`. Until the first of those,
every step after it is correctly blocked.
