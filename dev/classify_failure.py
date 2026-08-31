"""Tell an infrastructure failure apart from a test verdict, at the check level.

A red `Frontend` check currently carries two entirely different meanings and no
way to distinguish them without opening the raw job log: either an assertion
failed, or the runner died. Three infrastructure faults produce the same red as
a genuine failure - an `EACCES` on the shared cargo target during checkout, a
`socket hang up` while provisioning the toolchain, and an exit 137 that kills
the suite mid-run.

The third is the one that misleads, because partial test output is printed
before the kill. A reader sees real test names scroll past, then a red check,
and reasonably concludes a test failed. That has already caused a fix to be
judged ineffective on a run where the suite never executed, and a mid-suite kill
to be read as a verdict.

The discriminator is not a signature, it is an ABSENCE. vitest prints its
`Test Files ...` summary only after the suite has run to completion. A red
without that line is not a verdict about the code at all - whatever else went
wrong, the tests did not finish reporting. Signature matching then only NAMES a
known fault; it never decides the question, so a novel infrastructure failure
still classifies correctly instead of being mistaken for an assertion.

The cost of this being wrong is asymmetric, so the bias is deliberate: calling a
genuine test failure "infrastructure" would hide a real defect, while calling an
infrastructure failure "unclassified" merely leaves today's ambiguity. The
summary line is therefore required to be PRESENT before anything is reported as
a test verdict.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

#: vitest's end-of-run summary. Its presence is what makes a red a verdict.
SUITE_SUMMARY = re.compile(r"^\s*Test Files\s+", re.MULTILINE)

#: Known infrastructure faults, each paired with what a reader should do about
#: it. Matching one only names the fault; it never decides whether the run was a
#: verdict, so an unrecognised infrastructure failure is still not called a test
#: failure.
SIGNATURES: tuple[tuple[str, re.Pattern[str], str], ...] = (
    (
        "shared cargo target is not writable",
        re.compile(r"EACCES.*rustc_info\.json|rustc_info\.json.*EACCES", re.IGNORECASE),
        "a previous run left the shared target directory owned by another user; "
        "the workspace needs reclaiming, and the run says nothing about the code",
    ),
    (
        "runner was shut down mid-suite",
        re.compile(r"received a shutdown signal|exit code 137|\bExit code 137\b"),
        "the host reclaimed the runner, most likely under memory pressure; any "
        "test output above the kill is partial and is not a verdict",
    ),
    (
        "toolchain provisioning lost its connection",
        re.compile(r"socket hang up|ECONNRESET.*toolchain|error sending request"),
        "a transient network fault before the suite started; safe to re-run",
    ),
)


@dataclass(frozen=True)
class Verdict:
    """What a failed run actually established."""

    #: True only when vitest reported a summary, i.e. the suite ran and judged
    #: the code.
    is_test_verdict: bool
    #: A named infrastructure fault, when one is recognised.
    fault: str | None
    #: What the reader should take from it.
    guidance: str

    @property
    def title(self) -> str:
        if self.is_test_verdict:
            return "Test failure"
        if self.fault is not None:
            return f"Infrastructure: {self.fault}"
        return "Infrastructure: no test verdict was produced"


def classify(log: str) -> Verdict:
    """Decide what a failed run established, from its own output."""
    if SUITE_SUMMARY.search(log) is not None:
        return Verdict(
            is_test_verdict=True,
            fault=None,
            guidance="the suite ran to completion and reported; this red is about the code",
        )
    for fault, pattern, guidance in SIGNATURES:
        if pattern.search(log) is not None:
            return Verdict(is_test_verdict=False, fault=fault, guidance=guidance)
    return Verdict(
        is_test_verdict=False,
        fault=None,
        guidance="the suite never reported a summary, so nothing was established "
        "about the code; read the job log before treating this as a failure",
    )


def render(verdict: Verdict) -> str:
    """The workflow-command annotation for a verdict."""
    level = "error" if verdict.is_test_verdict else "notice"
    return f"::{level} title={verdict.title}::{verdict.guidance}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("log", type=Path, help="the captured suite output")
    args = parser.parse_args(argv)
    # An absent log is itself the absence of a verdict, not a crash: the step
    # that would have written it never ran.
    text = args.log.read_text(encoding="utf-8", errors="replace") if args.log.is_file() else ""
    verdict = classify(text)
    print(render(verdict))
    return 0


if __name__ == "__main__":  # pragma: no cover - entry point
    sys.exit(main())
