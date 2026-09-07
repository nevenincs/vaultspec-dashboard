import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
APPROVED_ICO_SHA256 = "7291c0067ac4da1d3e7a31b6a0183b23eafed5611a687ab6a8f490e647504705"
APPROVED_README_SHA256 = "4f74b14c65308c84c6a24289c1999a64fbe61fef954101ff4945d1c807708f57"
BINARY_PACKAGES = (
    "vaultspec-cli",
    "vaultspec-updater",
    "vaultspec-product",
    "vaultspec-release-verify",
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ico_sizes(path: Path) -> list[int]:
    data = path.read_bytes()
    reserved, kind, count = struct.unpack_from("<HHH", data)
    assert (reserved, kind) == (0, 1)
    sizes = []
    for index in range(count):
        width, height = struct.unpack_from("<BB", data, 6 + index * 16)
        assert width == height
        sizes.append(width or 256)
    return sizes


def test_governed_assets_are_exact_and_complete() -> None:
    assert digest(ROOT / "docs/assets/logo.png") == APPROVED_README_SHA256
    icon = ROOT / "engine/assets/vaultspec.ico"
    assert digest(icon) == APPROVED_ICO_SHA256
    assert digest(ROOT / "frontend/public/favicon.ico") == APPROVED_ICO_SHA256
    assert sorted(ico_sizes(icon)) == [16, 32, 48, 64, 128, 256]


def test_browser_and_in_app_surfaces_use_the_approved_mark() -> None:
    html = (ROOT / "frontend/index.html").read_text(encoding="utf-8")
    for asset in ("favicon.ico", "icon.svg", "favicon-32.png", "apple-touch-icon.png"):
        assert f'/{asset}' in html
    assert "data:image/svg+xml" not in html

    svg = (ROOT / "frontend/public/icon.svg").read_text(encoding="utf-8")
    assert "<title id=\"vaultspec-logo-title\">Vaultspec logo</title>" in svg
    assert "<desc id=\"vaultspec-logo-description\">" in svg
    assert 'aria-labelledby="vaultspec-logo-title vaultspec-logo-description"' in svg

    mark = (ROOT / "frontend/src/app/kit/BrandMark.tsx").read_text(encoding="utf-8")
    assert 'src="/icon.svg"' in mark
    assert "<circle" not in mark

    manifest = json.loads((ROOT / "frontend/public/site.webmanifest").read_text())
    purposes = {icon.get("purpose", "any") for icon in manifest["icons"]}
    assert purposes == {"any", "maskable"}


def test_every_windows_binary_package_enrolls_the_resource_compiler() -> None:
    helper = (ROOT / "engine/build/windows_resources.rs").read_text(encoding="utf-8")
    assert 'target.ends_with("windows-msvc")' in helper
    assert "resources.set_icon" in helper
    assert "resources.set_manifest_file" in helper

    for package in BINARY_PACKAGES:
        crate = ROOT / "engine/crates" / package
        assert 'winresource = "=0.1.23"' in (crate / "Cargo.toml").read_text()
        assert "embed_application_resources" in (crate / "build.rs").read_text()

    for package in ("vaultspec-updater", "vaultspec-product"):
        build = (ROOT / "engine/crates" / package / "build.rs").read_text()
        assert f'Some("{package}.manifest")' in build


def test_wix_uses_the_governed_icon_for_installer_surfaces() -> None:
    wix = (ROOT / "engine/crates/vaultspec-cli/wix/main.wxs").read_text()
    assert "<Icon Id='VaultspecIcon'" in wix
    assert "<Property Id='ARPPRODUCTICON' Value='VaultspecIcon'/>" in wix
    assert "Icon='VaultspecIcon'" in wix


def test_release_manifest_binds_resource_bearing_executables_by_digest() -> None:
    assembly = (ROOT / "packaging/assemble-build-spec.py").read_text()
    assert '"dashboard": {"source":' in assembly
    assert '"updater": {"source":' in assembly

    product = (ROOT / "engine/crates/vaultspec-product/src/product_build.rs").read_text()
    assert "file_digests" in product
    assert "sources.dashboard" in product
    assert "sources.updater" in product
