#!/usr/bin/env python3
"""Assemble the per-target product-build spec.

Emits the `BuildSources`-shaped JSON that `vaultspec-product-build` consumes, from
the pre-built inputs a release job has on disk: the dashboard and updater binaries,
the license files, the SBOM, and — when supplied — the built A2A onedir paired with
the committed component lock. The builder composes the tree and verifies the emitted
manifest against it; this script only marshals paths.

The A2A pair is OPTIONAL and indivisible: `--a2a-runtime` and `--lock` are supplied
together or not at all, and `sources.a2a` is emitted only when they are. Omitting
them omits the key outright rather than emitting an empty slot, so a tree built
without the runtime says so instead of claiming a runtime it does not carry. The
release currently builds that way — see the compose step in
`.github/workflows/product-release.yml` for why.

This is release-support glue used by `.github/workflows/product-release.yml` and by
a local real-tree build; it introduces no trust of its own.

Usage:
  assemble-build-spec.py \
    --target x86_64-pc-windows-msvc --version 0.1.4 --commit <40-hex> \
    --cohort-id release-0.1.4 \
    --generation-root <out>/generations/0001 \
    --dashboard <path> --updater <path> \
    --license vaultspec MIT <path> --sbom <path> \
    [--a2a-runtime <dir> --lock packaging/a2a-component.lock.json \
     --a2a-entrypoint vaultspec-a2a.exe] \
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
        default=None,
        help="the built A2A onedir DIRECTORY (PyInstaller dist output); pair with --lock",
    )
    p.add_argument(
        "--a2a-entrypoint",
        default=None,
        help="the launchable binary's name inside the onedir (default: vaultspec-a2a[.exe])",
    )
    p.add_argument("--lock", default=None, help="the component lock; pair with --a2a-runtime")
    p.add_argument("--sbom", required=True)
    p.add_argument("--sbom-format", default="cyclonedx")
    p.add_argument("--dashboard-name", default=None)
    p.add_argument("--updater-name", default=None)
    p.add_argument(
        "--license",
        action="append",
        nargs=3,
        default=[],
        metavar=("COMPONENT", "SPDX", "PATH"),
        # THREE ARGUMENTS, NOT ONE COLON-COMPOSITE. Under Git Bash on Windows
        # MSYS converts a standalone path-shaped argument to native form, but
        # reads an argument containing colons as a colon-separated path LIST and
        # leaves the tail unconverted -- so "vaultspec-a2a:MIT:/c/.../LICENSE"
        # reached native Python as a POSIX path it could not open, failing the
        # Windows compose leg while the other three legs got as far as the
        # portable-path check. Separate arguments convert like every other path
        # and carry no colon ambiguity.
        help="a license file: --license vaultspec-a2a MIT /path/a2a.txt",
    )
    args = p.parse_args()

    windows = args.target.endswith("windows-msvc")
    dashboard_name = args.dashboard_name or ("vaultspec.exe" if windows else "vaultspec")
    updater_name = args.updater_name or (
        "vaultspec-updater.exe" if windows else "vaultspec-updater"
    )
    # Only name an entrypoint for a runtime that exists. Defaulting
    # unconditionally minted a binary name inside an onedir that was never
    # supplied — a plausible-looking value describing nothing.
    a2a_entrypoint = None
    if args.a2a_runtime is not None:
        a2a_entrypoint = args.a2a_entrypoint or (
            "vaultspec-a2a.exe" if windows else "vaultspec-a2a"
        )

    licenses = []
    for component, spdx, path in args.license:
        name = path.replace("\\", "/").rsplit("/", 1)[-1]
        licenses.append(
            {
                "source": slashed(path),
                "dest_relative": f"licenses/{name}",
                "component": component,
                "spdx": spdx,
            }
        )

    # Refuse a spec that cannot build. A flag being PASSED proves only that, never
    # that the path behind it exists, so a missing declared input used to travel
    # all the way into `product_build`, which died on a bare "No such file or
    # directory (os error 2)" naming nothing. That is exactly how the first
    # four-target release build failed: `--sbom` pointed at
    # `packaging/sbom.cdx.json`, which nothing in the repository generates, and
    # the failure surfaced one stage later with no path attached.
    #
    # Checked HERE because this is the last point that still knows which FLAG a
    # path came from; downstream only sees an anonymous source string. The
    # pairing check is here for the same reason: `sources.a2a` carries the
    # runtime and its lock as one object, so half a pair is a spec that cannot
    # build, and only here are the two halves still two named flags.
    if (args.a2a_runtime is None) != (args.lock is None):
        given, absent = (
            ("--a2a-runtime", "--lock")
            if args.a2a_runtime is not None
            else ("--lock", "--a2a-runtime")
        )
        print(
            f"{p.prog}: {given} was passed without {absent}; the A2A runtime and "
            f"the lock that pins it are one source and must be passed together "
            f"or not at all",
            file=sys.stderr,
        )
        print(
            f"{p.prog}: refusing to emit a build spec that cannot compose",
            file=sys.stderr,
        )
        return 2

    missing = [
        (flag, path)
        for flag, path in (
            ("--dashboard", args.dashboard),
            ("--updater", args.updater),
            ("--sbom", args.sbom),
            *((("--lock", args.lock),) if args.lock is not None else ()),
            *((f"--license {component}", path)
              for component, _spdx, path in args.license),
        )
        if not os.path.isfile(path)
    ]
    if args.a2a_runtime is not None and not os.path.isdir(args.a2a_runtime):
        missing.append(("--a2a-runtime", args.a2a_runtime))
    if missing:
        for flag, path in missing:
            print(f"{p.prog}: {flag} does not exist: {path}", file=sys.stderr)
        print(
            f"{p.prog}: refusing to emit a build spec that cannot compose",
            file=sys.stderr,
        )
        return 2

    # One nested object, not two sibling keys: the runtime and the lock that
    # pins it are a single source, and `BuildSources` models them as one
    # `Option` so that "a runtime with no lock" cannot be expressed. Absent, the
    # key is omitted entirely — an empty slot would read as a runtime the tree
    # failed to carry rather than one it never claimed.
    a2a = None
    if args.a2a_runtime is not None:
        a2a = {
            "runtime": {
                "source_dir": slashed(args.a2a_runtime),
                "dest_relative": "a2a",
                "entrypoint_relative": a2a_entrypoint,
            },
            "component_lock": {
                "source": slashed(args.lock),
                "dest_relative": "packaging/a2a-component.lock.json",
            },
        }

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
            **({"a2a": a2a} if a2a is not None else {}),
            "licenses": licenses,
            "sbom": {"source": slashed(args.sbom), "dest_relative": "sbom.cdx.json"},
            "sbom_format": args.sbom_format,
        },
    }

    json.dump(spec, sys.stdout, indent=2)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
