#!/usr/bin/env python3
"""Assemble the per-target product-build spec (a2a-product-provisioning W04.P09).

Emits the `BuildSources`-shaped JSON that `vaultspec-product-build` consumes, from
the pre-built inputs a release job has on disk: the dashboard and updater binaries,
the fetched pinned A2A capsule (its archive, manifest, and tree-evidence document),
the committed component lock, the license files, and the SBOM. The A2A capsule
tree-evidence facts (`tree_digest`, `file_count`) are READ from the fetched
capsule's tree-evidence document and CARRIED — never recomputed here (A2A owns that
digest's canonical preimage). The builder verifies the capsule against the lock and
the emitted manifest against the composed tree; this script only marshals paths.

This is release-support glue used by `.github/workflows/product-release.yml` and by
a local real-tree build; it introduces no trust of its own.

Usage:
  assemble-build-spec.py \
    --target x86_64-pc-windows-msvc --version 0.1.4 --commit <40-hex> \
    --generation-root <out>/generations/0001 \
    --dashboard <path> --updater <path> \
    --capsule-archive <path> --capsule-manifest <path> --tree-evidence <path> \
    --lock packaging/a2a-component.lock.json \
    --license vaultspec-a2a:MIT:<path> --sbom <path> \
    [--dashboard-name vaultspec.exe --updater-name vaultspec-updater.exe] \
    > build-spec.json
"""
import argparse
import json
import os
import sys

ROSTER = [
    "aarch64-apple-darwin",
    "aarch64-unknown-linux-gnu",
    "x86_64-unknown-linux-gnu",
    "x86_64-pc-windows-msvc",
]


def slashed(path: str) -> str:
    return path.replace("\\", "/")


def main() -> int:
    p = argparse.ArgumentParser(description="Assemble a product-build spec")
    p.add_argument("--target", required=True, choices=ROSTER)
    p.add_argument("--version", required=True)
    p.add_argument("--commit", required=True, help="40-hex dashboard build commit")
    p.add_argument("--cohort-id", required=True)
    p.add_argument("--generation-root", required=True)
    p.add_argument("--dashboard", required=True)
    p.add_argument("--updater", required=True)
    p.add_argument(
        "--a2a-runtime",
        required=True,
        help="the built A2A onedir DIRECTORY (PyInstaller dist output)",
    )
    p.add_argument(
        "--a2a-entrypoint",
        default=None,
        help="the launchable binary's name inside the onedir (default: vaultspec-a2a[.exe])",
    )
    p.add_argument("--lock", required=True)
    p.add_argument("--sbom", required=True)
    p.add_argument("--sbom-format", default="cyclonedx")
    p.add_argument("--dashboard-name", default=None)
    p.add_argument("--updater-name", default=None)
    p.add_argument(
        "--license",
        action="append",
        default=[],
        metavar="COMPONENT:SPDX:PATH",
        help="a license file, e.g. vaultspec-a2a:MIT:/path/a2a.txt",
    )
    args = p.parse_args()

    windows = args.target.endswith("windows-msvc")
    dashboard_name = args.dashboard_name or ("vaultspec.exe" if windows else "vaultspec")
    updater_name = args.updater_name or (
        "vaultspec-updater.exe" if windows else "vaultspec-updater"
    )
    a2a_entrypoint = args.a2a_entrypoint or (
        "vaultspec-a2a.exe" if windows else "vaultspec-a2a"
    )

    licenses = []
    for spec in args.license:
        component, spdx, path = spec.split(":", 2)
        name = path.replace("\\", "/").rsplit("/", 1)[-1]
        licenses.append(
            {
                "source": slashed(path),
                "dest_relative": f"licenses/{name}",
                "component": component,
                "spdx": spdx,
            }
        )

    spec = {
        "generation_root": slashed(args.generation_root),
        "sources": {
            "target": args.target,
            "cohort_id": args.cohort_id,
            "cohort_targets": ROSTER,
            "release_manifest_path": "release.json",
            "dashboard_version": args.version,
            "dashboard_commit": args.commit,
            "dashboard": {"source": slashed(args.dashboard), "dest_relative": f"bin/{dashboard_name}"},
            "updater_version": args.version,
            "updater": {"source": slashed(args.updater), "dest_relative": f"bin/{updater_name}"},
            "a2a_runtime": {
                "source_dir": slashed(args.a2a_runtime),
                "dest_relative": "a2a",
                "entrypoint_relative": a2a_entrypoint,
            },
            "component_lock": {
                "source": slashed(args.lock),
                "dest_relative": "packaging/a2a-component.lock.json",
            },
            "licenses": licenses,
            "sbom": {"source": slashed(args.sbom), "dest_relative": "sbom.cdx.json"},
            "sbom_format": args.sbom_format,
        },
    }
    # Refuse a spec that cannot build. `required=True` proves only that a FLAG
    # was passed, never that the path behind it exists, so a missing declared
    # input used to travel all the way into `product_build`, which died on a
    # bare "No such file or directory (os error 2)" naming nothing. That is
    # exactly how the first four-target release build failed: `--sbom` pointed
    # at `packaging/sbom.cdx.json`, which nothing in the repository generates,
    # and the failure surfaced one stage later with no path attached.
    #
    # Checked HERE because this is the last point that still knows which FLAG a
    # path came from; downstream only sees an anonymous source string.
    missing = [
        (flag, path)
        for flag, path in (
            ("--dashboard", args.dashboard),
            ("--updater", args.updater),
            ("--lock", args.lock),
            ("--sbom", args.sbom),
            *((f"--license {spec_str.split(':', 2)[0]}", spec_str.split(":", 2)[2])
              for spec_str in args.license if spec_str.count(":") >= 2),
        )
        if not os.path.isfile(path)
    ]
    if not os.path.isdir(args.a2a_runtime):
        missing.append(("--a2a-runtime", args.a2a_runtime))
    if missing:
        for flag, path in missing:
            print(f"{p.prog}: {flag} does not exist: {path}", file=sys.stderr)
        print(
            f"{p.prog}: refusing to emit a build spec that cannot compose",
            file=sys.stderr,
        )
        return 2

    json.dump(spec, sys.stdout, indent=2)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
