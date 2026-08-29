# Scoop bucket

This directory makes the repository its own Scoop bucket. Scoop resolves app manifests
from a `bucket/` subdirectory when one is present, so no separate bucket repository
exists or needs to be created. Every product under this account repeats this layout,
which is what keeps the count of distribution repositories at zero per product.

Once a release publishes the complete product archive, install with:

```powershell
scoop bucket add vaultspec https://github.com/nevenincs/vaultspec-dashboard
scoop install vaultspec
```

## No manifest is committed

`vaultspec.json` is written by `.github/workflows/scoop-bump.yml` at release time and is
absent until that job first succeeds. That absence is deliberate: a manifest names a
version and pins a SHA-256, so a placeholder is a claim a user can act on and fail
against.

A placeholder is exactly what used to live here, and it was not a harmless stub. It
pinned version `0.1.2` with `"hash": "0000…0000"` and a URL for
`vaultspec-0.1.2-x86_64-pc-windows-msvc.zip` — an asset **no release has ever
published**. Every release from v0.1.0 through v0.1.4 attaches only the
`vaultspec-cli-*` archives, so that URL returns 404 on all of them. `scoop install
vaultspec` failed at the download, before the placeholder digest could even be checked.

The bump job never overwrote it because the job has never succeeded: it fetches
`${URL}.sha256` for the same non-existent asset and dies there. So the committed
placeholder turned "this channel was never finished" into "this channel is broken", and
hid the difference for four releases.

## Before this channel can ship

`scoop-bump.yml` points at the **complete product archive** — the whole offline tree,
deliberately, not the binary-only `vaultspec-cli` archive that Dist produces. That
archive is what `packaging/install.ps1` places, and the reasoning is recorded in
`dist-workspace.toml`. Until a release attaches it, there is nothing truthful for a
manifest to point at, and pointing one at the cli-only archive instead would ship
something that is not the product.

The same reasoning is why there is no `Formula/` here yet. vaultspec-core and
vaultspec-rag each ship a Homebrew tap from their own repository, and this product
should too — but over the archive it is actually supposed to install.
