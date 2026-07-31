"""Stage the built SPA bundle inside the api crate for embedding.

The packaged artifact (dashboard-packaging ADR) bakes the SPA into the release
binary via the ``embed-spa`` feature, so the result serves standalone with no
``frontend/dist`` on disk. The distribution-channels ADR requires the embed to
be boundary-clean, which is why the bundle is copied INTO the crate rather than
referenced across the workspace.

This replaced an inline ``python -c`` one-liner in the build recipe. The
behaviour is identical; having it as a module is what lets the recipe body stay
a single command with no quoting to get wrong on one platform and not the other.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

#: The built SPA bundle, produced by `just build frontend`.
SOURCE = Path("frontend/dist")

#: The staging directory inside the api crate that `embed-spa` compiles in.
DESTINATION = Path("engine/crates/vaultspec-api/assets/spa")


def main() -> int:
    """Replace the staged bundle with the current build.

    Returns:
        Zero on success, or one when the source bundle is absent.
    """
    if not SOURCE.is_dir():
        print(
            f"{SOURCE} does not exist - run the frontend build first",
            file=sys.stderr,
            flush=True,
        )
        return 1
    shutil.rmtree(DESTINATION, ignore_errors=True)
    shutil.copytree(SOURCE, DESTINATION)
    print(f"staged {SOURCE} -> {DESTINATION}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
