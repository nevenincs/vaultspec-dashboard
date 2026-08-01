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

__all__ = ["__doc__"]
