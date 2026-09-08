"""Keep the design-system consolidation scanner in the repository gates.

The scanner policy lives in ``frontend/dev`` and the command graph lives in
``dev/toolchain.py``. These guards protect that wiring without duplicating the
scanner's classification rules or moving development policy into shipped code.
"""

from __future__ import annotations

import fnmatch
import json
import subprocess
import tomllib
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from dev.runner import Cmd
from dev.toolchain import LINT

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence

DESIGN_SYSTEM_SCRIPT = "lint:design-system"
CANONICAL_SCANNER_COMMAND = "node dev/tooling/scan-design-system.mjs"
EXPECTED_PREDECESSOR = "lint:modules"
EXPECTED_SUCCESSOR = "format:check"
SHIPPED_FRONTEND_ROOT = Path("frontend/src")
DEV_FRONTEND_ROOT = Path("frontend/dev")
SOURCE_SUFFIXES = frozenset({".ts", ".tsx", ".js", ".jsx", ".mjs"})
CANONICAL_RECIPE_ARGV = (
    "npm",
    "--prefix",
    "frontend",
    "run",
    DESIGN_SYSTEM_SCRIPT,
)
CANONICAL_SCANNER_PATH = "dev/tooling/scan-design-system.mjs"
TYPESCRIPT_IMPORT_PROBE = r"""
import ts from "typescript";

const records = JSON.parse(await new Promise((resolve) => {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => resolve(input));
}));
const imports = [];
const errors = [];
for (const record of records) {
  const sourceFile = ts.createSourceFile(
    record.path,
    record.source,
    ts.ScriptTarget.Latest,
    true,
    record.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    errors.push(record.path);
    continue;
  }
  const add = (literal) => {
    if (literal && ts.isStringLiteralLike(literal)) {
      imports.push([record.path, literal.text]);
    }
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      add(node.arguments[0]);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      add(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}
process.stdout.write(JSON.stringify({ imports, errors }));
"""


def _frontend_lint_scripts(steps: Iterable[object]) -> list[str]:
    """Return npm script names from the declarative frontend lint recipe."""
    prefix = ("npm", "--prefix", "frontend", "run")
    return [
        step.argv[-1]
        for step in steps
        if isinstance(step, Cmd) and step.argv[:4] == prefix
    ]


def _scanner_commands(steps: Iterable[object]) -> list[tuple[str, ...]]:
    """Return every recipe command that can invoke the scanner."""
    commands: list[tuple[str, ...]] = []
    for step in steps:
        if not isinstance(step, Cmd):
            continue
        normalized = tuple(argument.replace("\\", "/") for argument in step.argv)
        if (
            DESIGN_SYSTEM_SCRIPT in normalized
            or CANONICAL_SCANNER_PATH in normalized
            or f"frontend/{CANONICAL_SCANNER_PATH}" in normalized
        ):
            commands.append(step.argv)
    return commands


def _recipe_errors(steps: Sequence[object]) -> list[str]:
    """Describe registration count and ordering violations."""
    errors: list[str] = []
    commands = _scanner_commands(steps)
    if len(commands) != 1:
        errors.append(f"expected exactly one scanner command; found {commands}")
        return errors
    if commands[0] != CANONICAL_RECIPE_ARGV:
        errors.append(f"scanner recipe command must be {CANONICAL_RECIPE_ARGV}")
        return errors
    scripts = _frontend_lint_scripts(steps)
    scanner = scripts.index(DESIGN_SYSTEM_SCRIPT)
    if scanner == 0 or scripts[scanner - 1] != EXPECTED_PREDECESSOR:
        errors.append(f"{DESIGN_SYSTEM_SCRIPT} must follow {EXPECTED_PREDECESSOR}")
    if scanner + 1 >= len(scripts) or scripts[scanner + 1] != EXPECTED_SUCCESSOR:
        errors.append(f"{DESIGN_SYSTEM_SCRIPT} must precede {EXPECTED_SUCCESSOR}")
    return errors


def _package_script_errors(package: object) -> list[str]:
    """Reject missing, redirected, or shell-composed scanner commands."""
    if not isinstance(package, dict) or not isinstance(package.get("scripts"), dict):
        return ["package scripts are missing"]
    actual = package["scripts"].get(DESIGN_SYSTEM_SCRIPT)
    if actual != CANONICAL_SCANNER_COMMAND:
        return [
            f"{DESIGN_SYSTEM_SCRIPT} must be exactly {CANONICAL_SCANNER_COMMAND!r}; "
            f"found {actual!r}"
        ]
    return []


def _typescript_imports(
    frontend_root: Path, records: Sequence[tuple[str, str]]
) -> list[tuple[str, str]]:
    """Extract executable import specifiers with the TypeScript parser."""
    payload = [{"path": path, "source": source} for path, source in records]
    result = subprocess.run(
        ["node", "--input-type=module", "--eval", TYPESCRIPT_IMPORT_PROBE],
        cwd=frontend_root,
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    parsed = json.loads(result.stdout)
    assert not parsed["errors"], f"TypeScript parse failed: {parsed['errors']}"
    return [(path, specifier) for path, specifier in parsed["imports"]]


def _references_frontend_dev(
    repo_root: Path, source_path: Path, specifier: str
) -> bool:
    """Resolve whether an import reaches the non-shipping frontend dev tree."""
    normalized = specifier.replace("\\", "/")
    if normalized == "@dev" or normalized.startswith("@dev/"):
        return True
    if normalized == "frontend/dev" or normalized.startswith("frontend/dev/"):
        return True
    if not normalized.startswith("."):
        return False
    candidate = (source_path.parent / normalized).resolve()
    return candidate.is_relative_to((repo_root / DEV_FRONTEND_ROOT).resolve())


def _production_dev_imports(repo_root: Path) -> list[tuple[str, str]]:
    """Return shipped frontend imports that resolve into ``frontend/dev``."""
    source_root = repo_root / SHIPPED_FRONTEND_ROOT
    records: list[tuple[str, str]] = []
    for path in sorted(source_root.rglob("*")):
        if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
            continue
        records.append(
            (
                path.relative_to(repo_root).as_posix(),
                path.read_text(encoding="utf-8", errors="replace"),
            )
        )
    imports = _typescript_imports(repo_root / "frontend", records)
    return [
        (path, specifier)
        for path, specifier in imports
        if _references_frontend_dev(repo_root, repo_root / path, specifier)
    ]


def test_design_system_scanner_is_once_and_in_order() -> None:
    """The complete frontend lint recipe must execute the scanner once."""
    scripts = _frontend_lint_scripts(LINT.targets["frontend"].steps)
    assert not _recipe_errors(LINT.targets["frontend"].steps), (
        f"design-system scanner lint wiring is invalid; present scripts: {scripts}"
    )


def test_design_system_package_script_is_canonical(repo_root: Path) -> None:
    """The recipe must not redirect or shell-wrap the scanner invocation."""
    package = json.loads((repo_root / "frontend/package.json").read_text("utf-8"))
    assert not _package_script_errors(package)
    assert (repo_root / "frontend/dev/tooling/scan-design-system.mjs").is_file()


def test_production_frontend_does_not_import_design_tooling(repo_root: Path) -> None:
    """Shipped frontend modules cannot reach tooling, ledger, or fixtures."""
    offenders = _production_dev_imports(repo_root)
    assert not offenders, f"production modules import frontend/dev: {offenders}"


def test_this_guard_is_in_the_configured_discovery(repo_root: Path) -> None:
    """The guard name and directory must remain visible to ordinary pytest."""
    config = tomllib.loads((repo_root / "pyproject.toml").read_text("utf-8"))
    pytest_config = config.get("tool", {}).get("pytest", {}).get("ini_options", {})
    testpaths = pytest_config.get("testpaths", [])
    patterns = pytest_config.get("python_files", ["test_*.py", "*_test.py"])
    relative = Path(__file__).resolve().relative_to(repo_root.resolve())
    assert any(Path(path) == Path("dev") for path in testpaths), testpaths
    assert any(fnmatch.fnmatch(relative.name, pattern) for pattern in patterns), (
        patterns
    )


@pytest.mark.parametrize(
    "steps, message",
    [
        (
            [
                Cmd(("npm", "--prefix", "frontend", "run", EXPECTED_PREDECESSOR)),
                Cmd(("npm", "--prefix", "frontend", "run", EXPECTED_SUCCESSOR)),
            ],
            "exactly one",
        ),
        (
            [
                Cmd(("npm", "--prefix", "frontend", "run", EXPECTED_PREDECESSOR)),
                Cmd(CANONICAL_RECIPE_ARGV),
                Cmd(CANONICAL_RECIPE_ARGV),
                Cmd(("npm", "--prefix", "frontend", "run", EXPECTED_SUCCESSOR)),
            ],
            "exactly one",
        ),
        (
            [
                Cmd(("npm", "--prefix", "frontend", "run", EXPECTED_PREDECESSOR)),
                Cmd(CANONICAL_RECIPE_ARGV),
                Cmd(("node", "frontend/dev/tooling/scan-design-system.mjs")),
                Cmd(("npm", "--prefix", "frontend", "run", EXPECTED_SUCCESSOR)),
            ],
            "exactly one",
        ),
        (
            [
                Cmd(CANONICAL_RECIPE_ARGV),
                Cmd(("npm", "--prefix", "frontend", "run", EXPECTED_PREDECESSOR)),
                Cmd(("npm", "--prefix", "frontend", "run", EXPECTED_SUCCESSOR)),
            ],
            "must follow",
        ),
        (
            [
                Cmd(("npm", "--prefix", "frontend", "run", EXPECTED_PREDECESSOR)),
                Cmd(("npm", "--prefix", "frontend", "run", EXPECTED_SUCCESSOR)),
                Cmd(CANONICAL_RECIPE_ARGV),
            ],
            "must precede",
        ),
    ],
)
def test_recipe_mutations_fail(steps: list[Cmd], message: str) -> None:
    """Missing, duplicate, and reordered scanner steps must go red."""
    assert any(message in error for error in _recipe_errors(steps))


@pytest.mark.parametrize(
    "command",
    [
        None,
        "node dev/tooling/scan-design-system.mjs --ignore-findings",
        "sh -c 'node dev/tooling/scan-design-system.mjs'",
        "node dev/tooling/run-design-system-wrapper.mjs",
        "node dev/tooling/scan-design-system.mjs || exit 0",
    ],
)
def test_package_script_mutations_fail(command: str | None) -> None:
    """Redirected, augmented, and shell-composed package scripts must fail."""
    assert _package_script_errors({"scripts": {DESIGN_SYSTEM_SCRIPT: command}})


@pytest.mark.parametrize(
    "statement, expected",
    [
        ('import ledger from "../../../dev/design-system/consolidation-ledger";', True),
        ('export { scan } from "../../../dev/tooling/scan-design-system.mjs";', True),
        ('const fixture = import("@dev/tooling/fixtures/design-system/x");', True),
        (
            'const scanner = require("frontend/dev/tooling/scan-design-system.mjs");',
            True,
        ),
        ('import { Button } from "../kit";', False),
        ('// import scanner from "../../dev/tooling/scan-design-system.mjs";', False),
        ("const prose = 'import(\"@dev/tooling/x\")';", False),
        ('const prose = `from "../../../dev/tooling/x"`;', False),
    ],
)
def test_import_fence_mutations(tmp_path: Path, statement: str, expected: bool) -> None:
    """Every supported dev-import form fails while comments and app imports pass."""
    repo_root = tmp_path
    source = repo_root / "frontend/src/app/nested/Surface.tsx"
    source.parent.mkdir(parents=True)
    imports = _typescript_imports(
        Path(__file__).resolve().parents[2] / "frontend",
        [(source.relative_to(repo_root).as_posix(), statement)],
    )
    actual = any(
        _references_frontend_dev(repo_root, source, specifier)
        for _, specifier in imports
    )
    assert actual is expected
