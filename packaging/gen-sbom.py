#!/usr/bin/env python3
"""Emit the product's full-tree CycloneDX SBOM from the three lockfiles.

The release passes `--sbom packaging/sbom.cdx.json` to `assemble-build-spec.py`,
which refuses to emit a spec when that path is absent. Nothing generated it, so
the first four-target release build died there. This is that generator.

FULL TREE, deliberately: every component resolved by any lockfile in the
product's build, not only the subset linked into a shipped binary. The narrower
reading ("what ships") cannot be derived honestly from a lockfile alone --
feature resolution and tree-shaking decide it -- so a filtered document would be
a guess wearing a manifest's authority. Build-time components are marked with a
`scope` property rather than dropped, which keeps the claim checkable.

DETERMINISTIC BY CONSTRUCTION: no wall clock, no environment, no filesystem
order. The four release targets each compose their own tree and `cohort-digest`
compares the results, so a timestamp here would make four honest builds disagree
and fail the cohort for a reason that has nothing to do with the product. Every
list is sorted; identity comes from `--version` and `--commit`.

Reads: engine/Cargo.lock (TOML), frontend/package-lock.json (npm lockfile v2/v3),
and the a2a checkout's uv.lock (TOML). A missing or unparseable lockfile is
fatal: an SBOM that silently omits an ecosystem is worse than no SBOM, because
it is indistinguishable from one that legitimately has nothing to report.
"""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
from pathlib import Path
from urllib.parse import quote

# A ceiling that FAILS rather than truncates. A silently capped SBOM would read
# as a complete one; the whole point of the document is that it is exhaustive.
MAX_COMPONENTS = 50_000


def _purl_npm(name: str, version: str) -> str:
    """`pkg:npm/...`, with a scoped name's `@scope/` segment percent-encoded."""
    if name.startswith("@") and "/" in name:
        scope, _, bare = name.partition("/")
        return f"pkg:npm/{quote(scope, safe='')}/{bare}@{version}"
    return f"pkg:npm/{name}@{version}"


def _component(name: str, version: str, purl: str, scope: str) -> dict:
    return {
        "type": "library",
        "name": name,
        "version": version,
        "purl": purl,
        "properties": [{"name": "vaultspec:scope", "value": scope}],
    }


def _read_toml(path: Path) -> dict:
    try:
        with path.open("rb") as handle:
            return tomllib.load(handle)
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise SystemExit(f"gen-sbom: cannot read {path}: {exc}")


def cargo_components(path: Path) -> list[dict]:
    """Every `[[package]]` in a Cargo lockfile.

    Workspace members carry no `source`; they are OUR code and are recorded with
    a distinct scope so a consumer can tell first-party from vendored.
    """
    packages = _read_toml(path).get("package", [])
    out = []
    for pkg in packages:
        name, version = pkg.get("name"), pkg.get("version")
        if not isinstance(name, str) or not isinstance(version, str):
            continue
        scope = "runtime" if pkg.get("source") else "first-party"
        out.append(_component(name, version, f"pkg:cargo/{name}@{version}", scope))
    return out


def npm_components(path: Path) -> list[dict]:
    """Every resolved package in an npm lockfile v2/v3.

    The `packages` map is keyed by install path; the `""` key is the root
    project itself, not a dependency. `dev` entries are build-time and are
    marked, never dropped -- see the module docstring on why.
    """
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"gen-sbom: cannot read {path}: {exc}")

    packages = data.get("packages")
    if not isinstance(packages, dict):
        raise SystemExit(
            f"gen-sbom: {path} has no 'packages' map; lockfileVersion "
            f"{data.get('lockfileVersion')!r} is not v2/v3"
        )

    out = []
    for install_path, meta in packages.items():
        if not install_path or not isinstance(meta, dict):
            continue
        version = meta.get("version")
        # The install path is authoritative for the name: `node_modules/a/node_modules/b`
        # is package `b`. `meta["name"]` is present only sometimes.
        name = meta.get("name") or install_path.rsplit("node_modules/", 1)[-1]
        if not isinstance(name, str) or not isinstance(version, str):
            continue
        scope = "build" if meta.get("dev") else "runtime"
        out.append(_component(name, version, _purl_npm(name, version), scope))
    return out


def uv_components(path: Path) -> list[dict]:
    """Every `[[package]]` in a uv lockfile (the a2a runtime's Python tree)."""
    out = []
    for pkg in _read_toml(path).get("package", []):
        name, version = pkg.get("name"), pkg.get("version")
        if not isinstance(name, str) or not isinstance(version, str):
            continue
        out.append(_component(name, version, f"pkg:pypi/{name}@{version}", "runtime"))
    return out


def main() -> int:
    p = argparse.ArgumentParser(prog="gen-sbom")
    p.add_argument("--version", required=True, help="product version")
    p.add_argument("--commit", required=True, help="product commit sha")
    p.add_argument("--cargo-lock", required=True, type=Path)
    p.add_argument("--npm-lock", required=True, type=Path)
    p.add_argument("--uv-lock", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args()

    # Fail on absence BEFORE parsing, naming the flag: the same lesson
    # assemble-build-spec.py records -- a missing declared input must surface
    # here, where the flag it came from is still known.
    missing = [
        (flag, path)
        for flag, path in (
            ("--cargo-lock", args.cargo_lock),
            ("--npm-lock", args.npm_lock),
            ("--uv-lock", args.uv_lock),
        )
        if not path.is_file()
    ]
    if missing:
        for flag, path in missing:
            print(f"gen-sbom: {flag} does not exist: {path}", file=sys.stderr)
        print("gen-sbom: refusing to emit a partial SBOM", file=sys.stderr)
        return 2

    components = (
        cargo_components(args.cargo_lock)
        + npm_components(args.npm_lock)
        + uv_components(args.uv_lock)
    )
    if not components:
        print("gen-sbom: no components resolved from any lockfile", file=sys.stderr)
        return 2
    if len(components) > MAX_COMPONENTS:
        print(
            f"gen-sbom: {len(components)} components exceeds the {MAX_COMPONENTS} "
            f"ceiling; refusing to emit rather than truncate",
            file=sys.stderr,
        )
        return 2

    # Sorted and de-duplicated on identity: one lockfile can resolve the same
    # name@version at several install paths, and the document should carry it
    # once. Sorting is what makes the four targets byte-identical.
    unique = {(c["name"], c["version"], c["purl"]): c for c in components}
    ordered = [unique[k] for k in sorted(unique)]

    bom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "metadata": {
            "component": {
                "type": "application",
                "name": "vaultspec",
                "version": args.version,
                "purl": f"pkg:github/vaultspec/vaultspec@{args.commit}",
            },
            "properties": [
                {"name": "vaultspec:commit", "value": args.commit},
                {"name": "vaultspec:tree", "value": "full"},
            ],
        },
        "components": ordered,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(bom, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"gen-sbom: {len(ordered)} components -> {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
