# Scoop bucket

**This directory is not the published bucket, and no manifest is committed here.**

The Scoop bucket for this product is the ORGANISATION tap
[`nevenincs/homebrew-tap`](https://github.com/nevenincs/homebrew-tap), which serves
`bucket/` for Scoop and `Formula/` for Homebrew across every nevenincs product. A
package manager resolves one bucket per organisation, not one per repository, so a
manifest committed to this repository's own `bucket/` is published nowhere a user's
Scoop can see.

```powershell
scoop bucket add nevenincs https://github.com/nevenincs/homebrew-tap
scoop install nevenincs/vaultspec
```

The app name is `vaultspec`: Scoop derives it from the manifest filename, and
`.github/workflows/scoop-bump.yml` writes `bucket/vaultspec.json` into the tap.

## What used to be here, and why it was wrong

This directory previously claimed the repository was its own Scoop bucket. Scoop *will*
resolve manifests from a `bucket/` subdirectory of any repo you add, so the claim was
plausible — it was simply not how this organisation publishes, and it does not match
where `scoop-bump.yml` actually commits.

Worse, it carried a committed placeholder manifest. That was not a harmless stub: it
pinned version `0.1.2` with `"hash": "0000…0000"` and a URL for
`vaultspec-0.1.2-x86_64-pc-windows-msvc.zip` — an asset **no release has ever
published**. `scoop install vaultspec` failed at the download, before the placeholder
digest could even be checked. The bump job never overwrote it because the job had never
succeeded: it fetches `${URL}.sha256` for the same non-existent asset and dies there. So
the committed placeholder turned "this channel was never finished" into "this channel is
broken", and hid the difference for four releases.

Both defects have the same fix, and it is the one in force now: publish to the org tap,
and commit no manifest until a real release produces one.

## How the manifest gets there

`.github/workflows/scoop-bump.yml` runs after the GitHub Release publishes, checks out
`nevenincs/homebrew-tap`, generates `bucket/vaultspec.json` whole with `jq -n`, verifies
the published archive's digest against its sibling `.sha256` by re-downloading, and
commits one bump per release. `scoop update` reads that COMMITTED manifest; the
`checkver`/`autoupdate` stanzas in it serve maintainer tooling only.

## Before this channel can ship

`scoop-bump.yml` points at the **complete product archive**
(`vaultspec-<version>-x86_64-pc-windows-msvc.zip`) — the whole offline tree,
deliberately, not the binary-only `vaultspec-cli` archive that Dist produces. That
archive is what `packaging/install.ps1` places, and the reasoning is recorded in
`dist-workspace.toml`. No published release attaches it yet, so nothing has been
committed to the tap and the channel remains *pending proof*: `vaultspec-core` and
`vaultspec-rag` are present in the tap today and this product is not.

Publication is additionally fail-closed behind
`.github/workflows/channel-publish-gate.yml`, which refuses until the phase-zero
clean-machine install/upgrade/downgrade/repair/uninstall proof flips the Scoop entry in
`packaging/a2a-support-matrix.json` from `feasibility_gated` to `supported`.

## Why this directory still exists

For this README. It documents where the bucket actually is, so that the next person who
looks for a `bucket/` in this repository finds the redirect rather than concluding the
Scoop channel was never wired. Scoop only reads `.json` manifests, so a directory holding
one Markdown file publishes nothing even if someone does add this repo as a bucket.
