"""Repository-health guards: the contracts this checkout holds about itself.

These are not tests of a product. Their subject is this repository's own
configuration - the `justfile`, the toolchain table, the dependency manifest,
and where development tooling is allowed to live - so they have no module to
cohabit with and live here instead.

Every guard here GATES: it runs inside `just lint` and a violation fails the
build. That is the whole point. The boundary these assert previously failed in
four places at once, and each of those violations passed human review
individually. Convention did not hold; the gate does.

A guard must be provably able to go red. When adding one, introduce the
violation it targets, watch it fail, then remove the violation - a check that
has never failed is not evidence that it can.
"""

from __future__ import annotations

__all__ = ["__doc__"]
