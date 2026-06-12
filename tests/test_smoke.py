"""Smoke tests verifying the package imports and exposes a version."""

import pytest


@pytest.mark.unit
def test_package_imports_and_exposes_version() -> None:
    import vaultspec_dashboard

    assert isinstance(vaultspec_dashboard.__version__, str)
    assert vaultspec_dashboard.__version__


@pytest.mark.unit
def test_entry_point_is_callable() -> None:
    from vaultspec_dashboard.__main__ import main

    assert callable(main)
