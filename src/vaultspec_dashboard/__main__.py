"""Console entry point for ``python -m vaultspec_dashboard``.

This is an intentionally minimal placeholder that wires up the installed
``vaultspec-dashboard`` script. The dashboard UI framework has not been
chosen yet, so for now the entry point only reports version and environment
information. It will be expanded once the UI stack is decided.
"""

from __future__ import annotations

import argparse

from vaultspec_dashboard import __version__


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="vaultspec-dashboard",
        description="Unified dashboard UI for the vaultspec ecosystem.",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"vaultspec-dashboard {__version__}",
    )
    parser.parse_args()

    print(f"vaultspec-dashboard {__version__}")
    print("UI not implemented yet - project scaffold is in place.")


if __name__ == "__main__":
    main()
