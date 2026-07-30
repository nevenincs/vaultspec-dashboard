#!/usr/bin/env bash
# The product-owned vaultspec installer for macOS and Linux.
#
# It installs the COMPLETE offline product tree — the dashboard binary, the
# copied external updater, the bundled A2A runtime (a frozen onedir built and
# shipped by this product, not fetched at install time), the release manifest,
# the component lock, licenses, and the SBOM — never a bare binary. The composed
# tree is offline-complete: nothing here resolves a runtime dependency over the
# network, and the only network touch is the optional release-archive download.
#
# Operations (exactly one per invocation):
#   --source <path>   Install from an ALREADY-COMPOSED local product tree (the
#                     generation directory the product builder emits). Fully
#                     offline.
#   --version <ver>   Fetch this host's release-set archive, verify its published
#                     checksum, and install it.
#   --update          Replace the installation through the product's OWN updater,
#                     which swaps the release outside the running seat under the
#                     installation lock and keeps the prior generation for
#                     rollback. The installer never overwrites a live tree itself.
#   --uninstall       Ask the product authority to drop its owned generations,
#                     receipt, and credentials (user data is preserved), then
#                     remove the installed tree.
#
# Trust boundary: this script restates NO trusted digest. The archive checksum it
# checks is transport integrity only; the installed tree's real verification is
# delegated to the shipped bounded Rust authority (`vaultspec verify-release`),
# which carries the trusted component lock compiled in — the same authority every
# other channel uses. Receipt state is likewise read from, and removed through,
# that authority; this script never writes or fabricates a receipt.
#
# Every failure is loud: there is no fallback path, no retry loop, and no
# best-effort continuation.
#
# Usage:
#   install.sh --source <tree> [--install-dir <dir>]
#   install.sh --version <ver> [--install-dir <dir>]
#   install.sh --update        [--install-dir <dir>]
#   install.sh --uninstall     [--install-dir <dir>]

set -euo pipefail

REPO="nevenincs/vaultspec-dashboard"
SOURCE=""
VERSION=""
UPDATE=0
UNINSTALL=0
INSTALL_DIR="${HOME}/.local/share/vaultspec"

# Bounds for the one network operation (release-archive download): a release set
# bundles a private interpreter, so the ceiling is generous but finite. No retry.
FETCH_CONNECT_TIMEOUT=20
FETCH_MAX_TIME=1800
FETCH_MAX_FILESIZE=2147483648

fail() {
    echo "vaultspec install: $1" >&2
    exit 1
}

note() {
    echo "vaultspec install: $1"
}

while [ $# -gt 0 ]; do
    case "$1" in
        --source) SOURCE="${2:?--source needs a path}"; shift 2 ;;
        --version) VERSION="${2:?--version needs a value}"; shift 2 ;;
        --install-dir) INSTALL_DIR="${2:?--install-dir needs a path}"; shift 2 ;;
        --update) UPDATE=1; shift ;;
        --uninstall) UNINSTALL=1; shift ;;
        *) fail "unknown argument: $1" ;;
    esac
done

selected=0
if [ -n "$SOURCE" ]; then selected=$((selected + 1)); fi
if [ -n "$VERSION" ]; then selected=$((selected + 1)); fi
if [ "$UPDATE" -eq 1 ]; then selected=$((selected + 1)); fi
if [ "$UNINSTALL" -eq 1 ]; then selected=$((selected + 1)); fi
if [ "$selected" -ne 1 ]; then
    fail "choose exactly one of --source <path>, --version <ver>, --update, --uninstall"
fi

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

# The host's release target triple. The supported roster is Apple Silicon macOS,
# Arm64 Linux, and x86-64 Linux; anything else is refused rather than guessed.
host_target() {
    local arch os
    arch="$(uname -m)"
    os="$(uname -s)"
    case "$os" in
        Darwin)
            case "$arch" in
                arm64|aarch64) echo "aarch64-apple-darwin" ;;
                *) fail "unsupported macOS architecture: $arch" ;;
            esac ;;
        Linux)
            case "$arch" in
                aarch64|arm64) echo "aarch64-unknown-linux-gnu" ;;
                x86_64) echo "x86_64-unknown-linux-gnu" ;;
                *) fail "unsupported Linux architecture: $arch" ;;
            esac ;;
        *) fail "unsupported operating system: $os" ;;
    esac
}

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        fail "no sha256 tool found (need sha256sum or shasum)"
    fi
}

# The dashboard binary inside a product tree — the shipped authority every
# product operation below is delegated to.
product_binary() {
    echo "${1}/bin/vaultspec"
}

installed_binary() {
    local binary
    binary="$(product_binary "$INSTALL_DIR")"
    [ -x "$binary" ] || fail "no installed product tree at ${INSTALL_DIR} (missing bin/vaultspec)"
    echo "$binary"
}

# VERIFY placement integrity with the SHIPPED bounded Rust authority — the
# dashboard binary just placed, which carries the trusted component lock embedded.
# A candidate tree cannot authorize its own lock.
verify_release() {
    local root="$1"
    local binary
    binary="$(product_binary "$root")"
    [ -x "$binary" ] || fail "placed tree has no bin/vaultspec"
    "$binary" verify-release "$root" >/dev/null || fail "installed tree failed verification"
}

# Report the product RECEIPT state read from the same authority. The receipt (the
# fixed active-generation journal entry and its channel provenance) is established
# by the product itself on first launch, never written by this script, so an
# absent or not-yet-readable receipt after a fresh install is a stated fact and
# not a claim that one exists.
report_receipt() {
    local binary="$1"
    local status
    if ! status="$("$binary" --json a2a status 2>&1)"; then
        # Report the authority's own reason rather than assuming a state.
        echo "$status" >&2
        note "receipt: state not readable right now (reason above); the product creates and repairs it on launch"
        return 0
    fi
    if printf '%s' "$status" | grep -q '"installed": true'; then
        note "receipt: established; the product authority reports an active generation"
    else
        note "receipt: absent — the product creates it on first launch"
    fi
}

if [ "$UNINSTALL" -eq 1 ]; then
    if [ ! -d "$INSTALL_DIR" ]; then
        note "nothing to remove at ${INSTALL_DIR}"
        exit 0
    fi
    binary="$(installed_binary)"
    # Stop the running app first so nothing is replaced or removed underneath a
    # live seat; `stop` is idempotent.
    "$binary" stop >/dev/null || fail "could not stop the running app; retry after it exits"
    # Drop the product's OWNED state — generations, receipt, and credentials —
    # through its own authority, which preserves user data (it lives outside the
    # install directory). A never-launched tree owns nothing yet: that one bounded
    # refusal is an expected state, and every other refusal aborts rather than
    # stranding state the authority still owns.
    if removal="$("$binary" --json a2a remove 2>&1)"; then
        note "removed the product receipt and owned generations (user data preserved)"
    elif printf '%s' "$removal" | grep -q 'a2a is not installed'; then
        note "no product receipt to remove (this tree was never launched)"
    else
        echo "$removal" >&2
        fail "the product authority refused removal; the tree was left in place"
    fi
    rm -rf "$INSTALL_DIR"
    note "removed ${INSTALL_DIR}"
    exit 0
fi

if [ "$UPDATE" -eq 1 ]; then
    binary="$(installed_binary)"
    # Delegate to the product's own receipt-gated update path: it stops the seat,
    # hands the replacement to the copied external updater running OUTSIDE the
    # active release under the installation lock, and relaunches. This script must
    # never overwrite a live tree itself — that would bypass the installation
    # lock and destroy the retained prior generation a rollback needs.
    if ! output="$("$binary" update 2>&1)"; then
        echo "$output" >&2
        fail "update failed"
    fi
    if printf '%s' "$output" | grep -q '"updated": false'; then
        echo "$output" >&2
        fail "the product refused to self-update (see the reason above)"
    fi
    # The updater replaced files under us: re-verify the tree it activated.
    verify_release "$INSTALL_DIR"
    note "updated and verified the product tree at ${INSTALL_DIR}"
    report_receipt "$(installed_binary)"
    exit 0
fi

# INSTALL. An existing installation is never clobbered: replacing a live tree
# behind the updater's back would bypass the installation lock and discard the
# retained prior generation.
if [ -e "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null || true)" ]; then
    fail "${INSTALL_DIR} already holds an installation; use --update to replace it through the product updater, or --uninstall first"
fi

source_tree=""
tmp=""
cleanup() { if [ -n "$tmp" ]; then rm -rf "$tmp"; fi }
trap cleanup EXIT

if [ -n "$SOURCE" ]; then
    [ -f "${SOURCE}/release.json" ] || fail "--source '${SOURCE}' is not a composed product tree (no release.json)"
    source_tree="$SOURCE"
else
    require_command curl
    require_command tar
    target="$(host_target)"
    archive="vaultspec-${VERSION}-${target}.tar.gz"
    base="https://github.com/${REPO}/releases/download/v${VERSION}"
    tmp="$(mktemp -d)"
    note "fetching ${archive}"
    # One bounded attempt per file: connect timeout, wall-clock ceiling, and size
    # cap. A failure is reported, never retried in a loop.
    fetch() {
        curl --fail --silent --show-error --location \
            --connect-timeout "$FETCH_CONNECT_TIMEOUT" \
            --max-time "$FETCH_MAX_TIME" \
            --max-filesize "$FETCH_MAX_FILESIZE" \
            "$1" -o "$2" || fail "download failed: $1"
    }
    fetch "${base}/${archive}" "${tmp}/${archive}"
    fetch "${base}/${archive}.sha256" "${tmp}/${archive}.sha256"
    # Transport integrity only — the published checksum proves the download was
    # not truncated or corrupted. Product trust is the Rust authority's job below.
    expected="$(awk '{print $1}' "${tmp}/${archive}.sha256")"
    actual="$(sha256_of "${tmp}/${archive}")"
    [ -n "$expected" ] || fail "published checksum for ${archive} is empty"
    [ "$expected" = "$actual" ] || fail "downloaded archive checksum mismatch"
    mkdir -p "${tmp}/tree"
    tar -xzf "${tmp}/${archive}" -C "${tmp}/tree"
    [ -f "${tmp}/tree/release.json" ] || fail "the release archive is not a composed product tree (no release.json)"
    source_tree="${tmp}/tree"
fi

mkdir -p "$INSTALL_DIR"
cp -R "${source_tree}/." "$INSTALL_DIR/"
note "placed the complete product tree at ${INSTALL_DIR}"

verify_release "$INSTALL_DIR"
note "verified the installed tree against its release manifest"

report_receipt "$(product_binary "$INSTALL_DIR")"
note "complete. Launch ${INSTALL_DIR}/bin/vaultspec"
