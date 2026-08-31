#Requires -Version 5.1
<#
.SYNOPSIS
    The product-owned vaultspec Windows installer.

.DESCRIPTION
    Installs the COMPLETE offline product tree - the dashboard binary, the copied
    external updater, the bundled A2A runtime (a frozen onedir built and shipped
    by this product, not fetched at install time), the release manifest, the
    component lock, licenses, and the SBOM - never a bare binary. The composed
    tree is offline-complete: nothing here resolves a runtime dependency over the
    network, and the only network touch is the optional release-archive download.

    At most one operation runs per invocation. Selecting NONE installs the newest
    published release, which is the only shape a piped invocation can take:
    `irm <release-url>/install.ps1 | iex` carries no parameters, so a script that
    demanded one could never be served from its own release page.
      -Source <path>  Install from an ALREADY-COMPOSED local product tree (the
                      generation directory the product builder emits). Fully
                      offline.
      -Version <ver>  Fetch this host's release-set archive, verify its published
                      checksum, and install it.
      -Update         Replace the installation through the product's OWN updater,
                      which swaps the release outside the running seat under the
                      installation lock and keeps the prior generation for
                      rollback. The installer never overwrites a live tree itself.
      -Uninstall      Ask the product authority to drop its owned generations,
                      receipt, and credentials (user data is preserved), then
                      remove the installed tree.

    Trust boundary: this script restates NO trusted digest. The archive checksum
    it checks is transport integrity only; the installed tree's real verification
    is delegated to the shipped bounded Rust authority (`vaultspec
    verify-release`), which carries the trusted component lock compiled in - the
    same authority every other channel uses. Receipt state is likewise read from,
    and removed through, that authority; this script never writes or fabricates a
    receipt.

    Every failure is loud: there is no fallback path, no retry loop, and no
    best-effort continuation.

.PARAMETER Source
    A local composed product-tree (generation) directory to install from.

.PARAMETER Version
    A release version to fetch and install. Omitted, the newest published release
    is resolved from the GitHub release API.

.PARAMETER InstallDir
    Where to place the product tree. Defaults to the per-user Programs location.

.PARAMETER Update
    Replace the installation through the product's own external updater.

.PARAMETER Uninstall
    Remove a previously installed product tree, preserving user data (which lives
    outside the install directory).

.EXAMPLE
    ./install.ps1
    ./install.ps1 -Source C:\path\to\generations\0001 -InstallDir C:\vaultspec
    ./install.ps1 -Update -InstallDir C:\vaultspec
    ./install.ps1 -Uninstall -InstallDir C:\vaultspec
#>
[CmdletBinding()]
param(
    [string]$Source,
    [string]$Version,
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\vaultspec'),
    [switch]$Update,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

# The one supported Windows release target. An unsupported host is refused rather
# than served an uncertified emulated build.
$Target = 'x86_64-pc-windows-msvc'
$Repo = 'nevenincs/vaultspec-dashboard'

# Bounds for the one network operation (release-archive download): a release set
# bundles a private interpreter, so the ceiling is generous but finite. No retry.
$FetchTimeoutSec = 1800
$FetchMaxBytes = 2147483648

function Fail($message) {
    [Console]::Error.WriteLine("vaultspec install: $message")
    exit 1
}

function Note($message) {
    Write-Host "vaultspec install: $message"
}

$selected = @($Source, $Version | Where-Object { $_ }).Count +
            @($Update.IsPresent, $Uninstall.IsPresent | Where-Object { $_ }).Count
# The operations remain mutually exclusive, so two or more is still a refusal.
# Zero is not: it is the piped-installer shape, and it resolves the newest
# published release below rather than exiting on the release page's own URL.
if ($selected -gt 1) {
    Fail 'choose at most one of -Source <path>, -Version <ver>, -Update, -Uninstall'
}

# Resolve the newest published release from the GitHub API, reading nothing from
# it but `tag_name`. That tag is remote input, not a trusted path segment, so it
# is matched against a version shape BEFORE it is pasted into a download URL; an
# unparseable or missing tag is a loud stop, never a guessed version.
function Resolve-LatestVersion {
    $unresolved = "could not resolve the latest release of $Repo"
    $fallback = 'pass -Version <ver> to install a specific one'
    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" `
            -UseBasicParsing -TimeoutSec $FetchTimeoutSec
    } catch {
        [Console]::Error.WriteLine($_.Exception.Message)
        Fail "$($unresolved): the GitHub release API was unreachable, rate-limited, or has no published release; $fallback"
    }
    $tag = "$($release.tag_name)" -replace '^v', ''
    if ($tag -notmatch '^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$') {
        Fail "$($unresolved): the GitHub release API returned no usable tag_name (got '$tag'); $fallback"
    }
    $tag
}

# The dashboard binary inside a product tree - the shipped authority every
# product operation below is delegated to.
function Get-ProductBinary($root) {
    Join-Path $root 'bin\vaultspec.exe'
}

function Get-InstalledBinary {
    $binary = Get-ProductBinary $InstallDir
    if (-not (Test-Path -LiteralPath $binary)) {
        Fail "no installed product tree at $InstallDir (missing bin\vaultspec.exe)"
    }
    $binary
}

# Run the shipped binary, returning its combined output; the caller decides what a
# non-zero exit means.
function Invoke-Product($binary, [string[]]$productArgs) {
    # Windows PowerShell surfaces a native command's stderr as error records, and
    # under a Stop preference that would abort this call before the caller can
    # read the outcome. The process EXIT CODE is the authority here, so stderr is
    # captured as text rather than thrown, and every caller checks the code.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $binary @productArgs 2>&1 |
            ForEach-Object {
                if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { $_ }
            } | Out-String
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    [pscustomobject]@{ ExitCode = $code; Output = $output.Trim() }
}

# VERIFY placement integrity with the SHIPPED bounded Rust authority - the
# dashboard binary just placed, which carries the trusted component lock embedded.
# A candidate tree cannot authorize its own lock.
function Invoke-VerifyRelease($root) {
    $binary = Get-ProductBinary $root
    if (-not (Test-Path -LiteralPath $binary)) { Fail 'placed tree has no bin\vaultspec.exe' }
    $result = Invoke-Product $binary @('verify-release', $root)
    if ($result.ExitCode -ne 0) {
        [Console]::Error.WriteLine($result.Output)
        Fail "installed tree failed verification (exit $($result.ExitCode))"
    }
}

# Report the product RECEIPT state read from the same authority. The receipt (the
# fixed active-generation journal entry and its channel provenance) is established
# by the product itself on first launch, never written by this script, so an
# absent or not-yet-readable receipt after a fresh install is a stated fact and
# not a claim that one exists.
function Show-ReceiptState($binary) {
    $result = Invoke-Product $binary @('--json', 'a2a', 'status')
    if ($result.ExitCode -ne 0) {
        [Console]::Error.WriteLine($result.Output)
        Note 'receipt: state not readable right now (reason above); the product creates and repairs it on launch'
        return
    }
    $installed = $null
    try { $installed = ($result.Output | ConvertFrom-Json).data.installed } catch { $installed = $null }
    if ($installed -eq $true) {
        Note 'receipt: established; the product authority reports an active generation'
    } else {
        Note 'receipt: absent - the product creates it on first launch'
    }
}

if ($Uninstall) {
    if (-not (Test-Path -LiteralPath $InstallDir)) {
        Note "nothing to remove at $InstallDir"
        exit 0
    }
    $binary = Get-InstalledBinary
    # Stop the running app first so nothing is replaced or removed underneath a
    # live seat; `stop` is idempotent.
    $stopped = Invoke-Product $binary @('stop')
    if ($stopped.ExitCode -ne 0) {
        [Console]::Error.WriteLine($stopped.Output)
        Fail 'could not stop the running app; retry after it exits'
    }
    # Drop the product's OWNED state - generations, receipt, and credentials -
    # through its own authority, which preserves user data (it lives outside the
    # install directory). A never-launched tree owns nothing yet: that one bounded
    # refusal is an expected state, and every other refusal aborts rather than
    # stranding state the authority still owns.
    $removal = Invoke-Product $binary @('--json', 'a2a', 'remove')
    if ($removal.ExitCode -eq 0) {
        Note 'removed the product receipt and owned generations (user data preserved)'
    } elseif ($removal.Output -match 'a2a is not installed') {
        Note 'no product receipt to remove (this tree was never launched)'
    } else {
        [Console]::Error.WriteLine($removal.Output)
        Fail 'the product authority refused removal; the tree was left in place'
    }
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
    Note "removed $InstallDir"
    exit 0
}

if ($Update) {
    $binary = Get-InstalledBinary
    # Delegate to the product's own receipt-gated update path: it stops the seat,
    # hands the replacement to the copied external updater running OUTSIDE the
    # active release under the installation lock, and relaunches. This script must
    # never overwrite a live tree itself - that would bypass the installation lock
    # and destroy the retained prior generation a rollback needs.
    $updated = Invoke-Product $binary @('update')
    if ($updated.ExitCode -ne 0) {
        [Console]::Error.WriteLine($updated.Output)
        Fail 'update failed'
    }
    if ($updated.Output -match '"updated"\s*:\s*false') {
        [Console]::Error.WriteLine($updated.Output)
        Fail 'the product refused to self-update (see the reason above)'
    }
    # The updater replaced files under us: re-verify the tree it activated.
    Invoke-VerifyRelease $InstallDir
    Note "updated and verified the product tree at $InstallDir"
    Show-ReceiptState (Get-InstalledBinary)
    exit 0
}

# INSTALL. An existing installation is never clobbered: replacing a live tree
# behind the updater's back would bypass the installation lock and discard the
# retained prior generation.
if ((Test-Path -LiteralPath $InstallDir) -and
    (Get-ChildItem -LiteralPath $InstallDir -Force | Select-Object -First 1)) {
    Fail "$InstallDir already holds an installation; use -Update to replace it through the product updater, or -Uninstall first"
}

$temp = $null
try {
    if ($Source) {
        if (-not (Test-Path -LiteralPath (Join-Path $Source 'release.json'))) {
            Fail "-Source '$Source' is not a composed product tree (no release.json)"
        }
        $sourceTree = $Source
    } else {
        if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -and $env:PROCESSOR_ARCHITEW6432 -ne 'AMD64') {
            Fail "unsupported Windows architecture: $env:PROCESSOR_ARCHITECTURE (the supported target is $Target)"
        }
        if (-not $Version) {
            $Version = Resolve-LatestVersion
            Note "latest published release is $Version"
        }
        $base = "https://github.com/$Repo/releases/download/v$Version"
        $archive = "vaultspec-$Version-$Target.zip"
        $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("vaultspec-" + [guid]::NewGuid())
        New-Item -ItemType Directory -Path $temp | Out-Null
        $zip = Join-Path $temp $archive
        Note "fetching $archive"
        # Refuse an oversized artifact BEFORE downloading it, then bound the
        # transfer itself. One attempt per file; a failure is reported, never
        # retried in a loop.
        $head = Invoke-WebRequest -Uri "$base/$archive" -Method Head -UseBasicParsing -TimeoutSec $FetchTimeoutSec
        $declaredSize = [int64]($head.Headers['Content-Length'] | Select-Object -First 1)
        if ($declaredSize -gt $FetchMaxBytes) {
            Fail "release archive is larger than the $FetchMaxBytes byte ceiling ($declaredSize bytes)"
        }
        Invoke-WebRequest -Uri "$base/$archive" -OutFile $zip -UseBasicParsing -TimeoutSec $FetchTimeoutSec
        $checksum = (Invoke-WebRequest -Uri "$base/$archive.sha256" -UseBasicParsing -TimeoutSec $FetchTimeoutSec).Content
        # Transport integrity only - the published checksum proves the download
        # was not truncated or corrupted. Product trust is the Rust authority's
        # job below.
        $expected = ($checksum.Trim() -split '\s+')[0]
        if ([string]::IsNullOrWhiteSpace($expected)) { Fail "published checksum for $archive is empty" }
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash
        if ($actual -ne $expected.ToUpperInvariant()) { Fail 'downloaded archive checksum mismatch' }
        $extracted = Join-Path $temp 'tree'
        Expand-Archive -LiteralPath $zip -DestinationPath $extracted
        if (-not (Test-Path -LiteralPath (Join-Path $extracted 'release.json'))) {
            Fail 'the release archive is not a composed product tree (no release.json)'
        }
        $sourceTree = $extracted
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Copy-Item -Path (Join-Path $sourceTree '*') -Destination $InstallDir -Recurse -Force
    Note "placed the complete product tree at $InstallDir"
} finally {
    if ($temp -and (Test-Path -LiteralPath $temp)) {
        Remove-Item -LiteralPath $temp -Recurse -Force
    }
}

Invoke-VerifyRelease $InstallDir
Note 'verified the installed tree against its release manifest'

Show-ReceiptState (Get-ProductBinary $InstallDir)
Note "complete. Launch $InstallDir\bin\vaultspec.exe"
