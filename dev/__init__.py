"""The development harness for this repository.

Nothing here ships. The package exists so the `justfile` can stay a table of
contents: every recipe body is a single command, and all of the logic those
recipes would otherwise carry - target dispatch, step chaining, tool-or-Docker
fallback, environment overlay - lives here instead.

The dispatch core (:mod:`dev.runner`, :mod:`dev.toolchain`, :mod:`dev.__main__`)
imports only the standard library, which is what makes its behaviour identical on
every platform. Instruments that need more than a command line sit one level
down, in sub-packages that are free to depend on whatever they operate with
precisely because they are outside that core.
"""

from __future__ import annotations

import os
import sys

# Windows starts a Python process with its streams bound to the ANSI codepage
# (cp1252 on a stock installation), so ONE box-drawing character or accented
# identifier - in a tool's output, or in the command line this harness echoes
# before running it - raises UnicodeEncodeError and takes the recipe down with
# it. The failure belongs to Python, not the shell: it reproduces identically
# under `cmd` and under `pwsh`, so no choice of `set windows-shell` avoids it
# and the fix has to live here.
#
# Both halves are load bearing. Reconfiguring this process's own streams covers
# everything the harness itself prints; exporting PYTHONIOENCODING covers every
# Python child it spawns, which is most of the toolchain. An explicit value from
# the operator or a caller wins, so a deliberate override still works.
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
for _stream in (sys.stdout, sys.stderr):
    _reconfigure = getattr(_stream, "reconfigure", None)
    if _reconfigure is not None:
        _reconfigure(encoding="utf-8")

__all__ = ["__doc__"]
