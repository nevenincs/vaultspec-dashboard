#!/usr/bin/env python
"""Render genuine ``vaultspec`` CLI output for the root README.

The core and RAG repositories use the same Rich ``Console.export_svg``
workflow. Keep this script's interface aligned with theirs:

    uv run --no-sync python scripts/render_readme_assets.py [OUT_DIR]

``OUT_DIR`` defaults to ``docs/assets``. Set ``VAULTSPEC_BIN`` to select a
specific binary; otherwise the script prefers an installed executable, then
this worktree's release or debug build.
"""

from __future__ import annotations

import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

from rich.console import Console
from rich.terminal_theme import TerminalTheme
from rich.text import Text

os.environ.pop("NO_COLOR", None)

VAULTSPEC_THEME = TerminalTheme(
    background=(250, 247, 242),
    foreground=(30, 27, 24),
    normal=[
        (30, 27, 24),
        (166, 92, 92),
        (106, 122, 77),
        (163, 122, 58),
        (86, 108, 158),
        (124, 106, 156),
        (74, 124, 116),
        (94, 86, 78),
    ],
    bright=[
        (145, 137, 129),
        (146, 72, 72),
        (88, 104, 60),
        (140, 102, 42),
        (66, 88, 140),
        (104, 86, 138),
        (56, 106, 98),
        (30, 27, 24),
    ],
)

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
ROOT = Path(__file__).resolve().parents[1]


def recording_console(width: int) -> Console:
    return Console(
        record=True,
        width=width,
        force_terminal=True,
        legacy_windows=False,
        highlight=False,
        soft_wrap=True,
        file=io.StringIO(),
    )


def resolve_binary() -> Path:
    configured = os.environ.get("VAULTSPEC_BIN")
    if configured:
        candidate = Path(configured).expanduser().resolve()
        if candidate.is_file():
            return candidate
        raise FileNotFoundError(f"VAULTSPEC_BIN does not exist: {candidate}")

    suffix = ".exe" if os.name == "nt" else ""
    for profile in ("release", "debug"):
        candidate = ROOT / "engine" / "target" / profile / f"vaultspec{suffix}"
        if candidate.is_file():
            return candidate

    installed = shutil.which("vaultspec")
    if installed:
        return Path(installed)

    raise FileNotFoundError(
        "vaultspec binary not found; run `just dev build package` or set VAULTSPEC_BIN"
    )


def run_status() -> str:
    proc = subprocess.run(
        [str(resolve_binary()), "--json", "status"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip()
        raise RuntimeError(f"vaultspec status failed ({proc.returncode}): {detail}")
    payload = json.loads(proc.stdout)
    return json.dumps(payload, indent=2, ensure_ascii=False)


def render_svg(
    text: str,
    out_path: Path,
    title: str,
    width: int,
    max_lines: int | None = None,
) -> None:
    lines = text.splitlines()
    while lines and not lines[-1].strip():
        lines.pop()
    truncated = max_lines is not None and len(lines) > max_lines
    if truncated:
        lines = lines[:max_lines]

    out = recording_console(width)
    for line in lines:
        out.print(Text.from_ansi(line), no_wrap=True, overflow="ellipsis")
    if truncated:
        out.print(Text("  …", style="bright_black"))

    svg = out.export_svg(title=title, theme=VAULTSPEC_THEME)
    svg = svg.replace(
        'stroke="rgba(255,255,255,0.35)"',
        'stroke="rgba(30,27,24,0.22)"',
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(svg, encoding="utf-8")
    print(f"wrote {out_path} ({len(lines)} lines)")


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "assets"
    if not out_dir.is_absolute():
        out_dir = ROOT / out_dir
    render_svg(
        run_status(),
        out_dir / "term-status.svg",
        "vaultspec --json status",
        width=112,
        max_lines=24,
    )


if __name__ == "__main__":
    main()
