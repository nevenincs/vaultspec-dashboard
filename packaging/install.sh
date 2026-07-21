#!/usr/bin/env bash
# The product-owned vaultspec macOS/Linux installer
# (a2a-product-provisioning W04.P09.S74).
#
# Installs the COMPLETE offline product tree (the dashboard binary, the copied
# external updater, the pinned A2A capsule, manifests, licenses, SBOM, and the
# release manifest) — never the binary-only Cargo Dist installer. After placing
# the tree it VERIFIES placement integrity with the shipped bounded Rust authority
# (`vaultspec verify-release`): the installed tree must match its own release.json
# under the binary's embedded trusted component lock. It does not restate trusted
# digests in shell — verification is the same Rust authority every channel uses.
#
# Two source modes:
#   --source <path>    Install from an ALREADY-COMPOSED local product tree (the
#                      generation directory `product_build` emits). Offline, no
#                      fetch — the local-install affordance.
#   --version <ver>    Fetch the release-set archive for this host's target from
#                      the GitHub release, verify its checksum, and extract it.
#                      This is the RELEASE path (contract:
#                      `vaultspec-<version>-<target>.tar.gz` + `.sha256`).
#
# The first-run RECEIPT establishment (channel provenance, active-generation
# receipt) is the runtime provisioning path (a2a-product-provisioning S176); this
# installer PLACES and VERIFIES the tree — the receipt is established on first run.
#
# Usage:
#   install.sh --source <local-tree> [--install-dir <dir>]
#   install.sh --version <ver> [--install-dir <dir>]
#   install.sh --uninstall [--install-dir <dir>]

set -euo pipefail

REPO="nevenincs/vaultspec-dashboard"
SOURCE=""
VERSION=""
UNINSTALL=0
INSTALL_DIR="${HOME}/.local/share/vaultspec"

fail() {
    echo "vaultspec install: $1" >&2
    exit 1
}

while [ $# -gt 0 ]; do
    case "$1" in
        --source) SOURCE="${2:?--source needs a path}"; shift 2 ;;
        --version) VERSION="${2:?--version needs a value}"; shift 2 ;;
        --install-dir) INSTALL_DIR="${2:?--install-dir needs a path}"; shift 2 ;;
        --uninstall) UNINSTALL=1; shift ;;
        *) fail "unknown argument: $1" ;;
    esac
done

# The host's release target triple.
host_target() {
    local arch os
    arch="$(uname -m)"
    os="$(uname -s)"
    case "$os" in
        Darwin)
            case "$arch" in
                arm64|aarch64) echo "aarch64-apple-darwin" ;;
                x86_64) echo "x86_64-apple-darwin" ;;
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
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

verify_release() {
    # Verify placement integrity with the SHIPPED bounded Rust authority — the
    # dashboard binary just placed, which carries the trusted component lock
    # embedded. A candidate tree cannot authorize its own lock.
    local root="$1"
    local vaultspec="${root}/bin/vaultspec"
    [ -x "$vaultspec" ] || fail "placed tree has no bin/vaultspec"
    "$vaultspec" verify-release "$root" || fail "installed tree failed verification"
}

if [ "$UNINSTALL" -eq 1 ]; then
    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
        echo "vaultspec install: removed ${INSTALL_DIR}"
    else
        echo "vaultspec install: nothing to remove at ${INSTALL_DIR}"
    fi
    exit 0
fi

# Resolve the SOURCE tree to place.
source_tree=""
tmp=""
cleanup() { [ -n "$tmp" ] && rm -rf "$tmp"; }
trap cleanup EXIT

if [ -n "$SOURCE" ]; then
    [ -f "${SOURCE}/release.json" ] || fail "--source '${SOURCE}' is not a composed product tree (no release.json)"
    source_tree="$SOURCE"
elif [ -n "$VERSION" ]; then
    target="$(host_target)"
    archive="vaultspec-${VERSION}-${target}.tar.gz"
    base="https://github.com/${REPO}/releases/download/v${VERSION}"
    tmp="$(mktemp -d)"
    echo "vaultspec install: fetching ${archive}"
    curl -fsSL "${base}/${archive}" -o "${tmp}/${archive}"
    curl -fsSL "${base}/${archive}.sha256" -o "${tmp}/${archive}.sha256"
    expected="$(awk '{print $1}' "${tmp}/${archive}.sha256")"
    actual="$(sha256_of "${tmp}/${archive}")"
    [ "$expected" = "$actual" ] || fail "downloaded archive checksum mismatch"
    mkdir -p "${tmp}/tree"
    tar -xzf "${tmp}/${archive}" -C "${tmp}/tree"
    source_tree="${tmp}/tree"
else
    fail "specify --source <path> (local install) or --version <ver> (release fetch)"
fi

# PLACE the complete tree at the install location.
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -R "${source_tree}/." "$INSTALL_DIR/"
echo "vaultspec install: placed the product tree at ${INSTALL_DIR}"

# VERIFY placement integrity with the shipped Rust authority.
verify_release "$INSTALL_DIR"
echo "vaultspec install: verified the installed tree against its release manifest"

# The first-run receipt (channel provenance + active generation) is established by
# the runtime provisioning path on first launch (a2a-product-provisioning S176).
echo "vaultspec install: complete. Launch ${INSTALL_DIR}/bin/vaultspec"
