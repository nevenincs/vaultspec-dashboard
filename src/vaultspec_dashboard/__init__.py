"""Unified dashboard UI for the vaultspec ecosystem.

vaultspec-dashboard is the visual companion to
:mod:`vaultspec_core` (the governed development framework) and
:mod:`vaultspec_rag` (GPU-accelerated semantic search). It surfaces vault
health, document graphs, spec-driven workflow state, and search activity from
both siblings through a single user interface.

vaultspec-core is a runtime dependency; vaultspec-rag is a development-only
dependency (it pulls a heavy CUDA torch backend) and is consumed for local
integration work rather than shipped in the published wheel.
"""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__: str = version("vaultspec-dashboard")
except PackageNotFoundError:
    __version__ = "0.0.0.dev0"

__all__ = ["__version__"]
