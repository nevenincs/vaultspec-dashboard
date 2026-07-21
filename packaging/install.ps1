#Requires -Version 5.1
<#
.SYNOPSIS
    The product-owned vaultspec Windows installer (a2a-product-provisioning
    W04.P09.S75).

.DESCRIPTION
    Installs the COMPLETE offline product tree (the dashboard binary, the copied
    external updater, the pinned A2A capsule, manifests, licenses, SBOM, and the
    release manifest) — never the binary-only Cargo Dist installer. After placing
    the tree it VERIFIES placement integrity with the shipped bounded Rust
    authority (`vaultspec verify-release`): the installed tree must match its own
    release.json under the binary's embedded trusted component lock. It does not
    restate trusted digests in PowerShell — verification is the same Rust authority
    every channel uses.

    Two source modes:
      -Source <path>   Install from an ALREADY-COMPOSED local product tree (the
                         generation directory `product_build` emits). This is the
                         mode used for a real local install + verify on the build
                         machine — no network, no release fetch.
      -Version <ver>     Fetch the release-set archive for this host's target from
                         the GitHub release, verify its checksum, and extract it.
                         (The RELEASE path; its artifact contract is defined with
                         the release CI. Authored here; proven at release time.)

    The first-run RECEIPT establishment (channel provenance, active-generation
    receipt) is the runtime provisioning path (a2a-product-provisioning S176),
    gated on the windows-private-file credential authority; this installer PLACES
    and VERIFIES the tree — the receipt is established on first run.

.PARAMETER Source
    A local composed product-tree (generation) directory to install from.

.PARAMETER Version
    A release version to fetch and install (release mode).

.PARAMETER InstallDir
    Where to place the product tree. Defaults to the per-user Programs location.

.PARAMETER Uninstall
    Remove a previously installed product tree at -InstallDir (preserving user
    data, which lives outside the install directory).

.EXAMPLE
    # Real local install + verify from a composed tree, then remove.
    ./install.ps1 -Source C:\path\to\generations\0001 -InstallDir C:\vaultspec
    ./install.ps1 -Uninstall -InstallDir C:\vaultspec
#>
[CmdletBinding()]
param(
    [string]$Source,
    [string]$Version,
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\vaultspec'),
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$Target = 'x86_64-pc-windows-msvc'

function Fail($msg) {
    Write-Error "vaultspec install: $msg"
    exit 1
}

function Invoke-VerifyRelease($root) {
    # Verify placement integrity with the SHIPPED bounded Rust authority — the
    # dashboard binary just placed, which carries the trusted component lock
    # embedded. A candidate tree cannot authorize its own lock.
    $vaultspec = Join-Path $root 'bin\vaultspec.exe'
    if (-not (Test-Path $vaultspec)) { Fail "placed tree has no bin\vaultspec.exe" }
    & $vaultspec verify-release $root
    if ($LASTEXITCODE -ne 0) { Fail "installed tree failed verification (exit $LASTEXITCODE)" }
}

if ($Uninstall) {
    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir
        Write-Host "vaultspec install: removed $InstallDir"
    } else {
        Write-Host "vaultspec install: nothing to remove at $InstallDir"
    }
    exit 0
}

# Resolve the SOURCE tree to place.
$sourceTree = $null
if ($Source) {
    if (-not (Test-Path (Join-Path $Source 'release.json'))) {
        Fail "-Source '$Source' is not a composed product tree (no release.json)"
    }
    $sourceTree = $Source
} elseif ($Version) {
    # RELEASE mode: fetch + checksum + extract. The artifact contract
    # (`vaultspec-<version>-<target>.zip` + `.sha256`) is defined with the release
    # CI (W04.P09.S77); this path is authored and proven at release time.
    $base = "https://github.com/nevenincs/vaultspec-dashboard/releases/download/v$Version"
    $archive = "vaultspec-$Version-$Target.zip"
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("vaultspec-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $zip = Join-Path $tmp $archive
    Invoke-WebRequest -Uri "$base/$archive" -OutFile $zip
    $expected = (Invoke-WebRequest -Uri "$base/$archive.sha256").Content.Trim().Split()[0]
    $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
    if ($actual -ne $expected.ToLower()) { Fail "downloaded archive checksum mismatch" }
    $extracted = Join-Path $tmp 'tree'
    Expand-Archive -Path $zip -DestinationPath $extracted
    $sourceTree = $extracted
} else {
    Fail "specify -Source <path> (local install) or -Version <ver> (release fetch)"
}

# PLACE the complete tree at the install location.
if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
New-Item -ItemType Directory -Path $InstallDir | Out-Null
Copy-Item -Recurse -Force (Join-Path $sourceTree '*') $InstallDir
Write-Host "vaultspec install: placed the product tree at $InstallDir"

# VERIFY placement integrity with the shipped Rust authority.
Invoke-VerifyRelease $InstallDir
Write-Host "vaultspec install: verified the installed tree against its release manifest"

# The first-run receipt (channel provenance + active generation) is established by
# the runtime provisioning path on first launch (a2a-product-provisioning S176,
# gated on the windows-private-file credential authority). Placement + verification
# are complete.
Write-Host "vaultspec install: complete. Launch $InstallDir\bin\vaultspec.exe"
