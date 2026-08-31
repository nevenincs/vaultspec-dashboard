#!/usr/bin/env bash
# Leave the workspace usable for the job about to run, not for the one that
# just finished.
#
# Every job here already reclaims at the END, under `always()`. That cannot
# cover the case that actually hurts: a job the runner is SHUT DOWN under - the
# exit-137 kill - never reaches its trailing steps at all. Whatever it held is
# still held when the next job starts, and the first thing that job does is
# check out over it.
#
# So the same reclaim runs at the START too. It is cheap, idempotent, and does
# not depend on the previous job having survived long enough to tidy up.
#
# Invoked BEFORE `actions/checkout`, which is the step the EACCES lands on, so
# it cannot be a `uses:` composite - a local action is resolved out of the
# checked-out tree that does not exist yet. Callers guard with `|| true` so a
# workspace that has never been checked out simply skips this.
#
# Scoped to THIS workspace deliberately. Three runners share the machine, and a
# pattern broad enough to catch "a vaultspec engine" would also kill another
# repository's in-flight test. Only a process whose executable lives under the
# workspace being reclaimed is ours to stop.
set -uo pipefail

workspace="${1:-${GITHUB_WORKSPACE:-}}"
if [ -z "${workspace}" ] || [ ! -d "${workspace}" ]; then
  echo "reclaim: no workspace yet — nothing to do"
  exit 0
fi

# The live frontend suite spawns a real `vaultspec serve` from the built binary.
# A killed job leaves it running, holding files under engine/target that the
# next checkout has to overwrite.
# Matched on the executable PATH rather than anchored at the start of the
# command line: a process launched through an interpreter carries that
# interpreter first, and anchoring would let it through. The path is this
# workspace plus its build directory, which nothing else runs from.
left=$(pgrep -f "${workspace}/engine/target/[^ ]*/vaultspec" 2>/dev/null | tr '
' ' ')
if [ -n "${left}" ]; then
  echo "reclaim: stopping engine processes left from a previous job: ${left}"
  # shellcheck disable=SC2086
  kill ${left} 2>/dev/null || true
  sleep 2
  # shellcheck disable=SC2086
  kill -9 ${left} 2>/dev/null || true
else
  echo "reclaim: no engine process left running from this workspace"
fi

# Only remove the build directory when it is genuinely unusable. Removing it
# every time would throw away the incremental cache and add minutes to every
# job, so the test is whether the file the EACCES actually lands on is writable.
probe="${workspace}/engine/target/.rustc_info.json"
if [ -e "${probe}" ] && [ ! -w "${probe}" ]; then
  echo "reclaim: ${probe} is not writable — removing the build directory"
  ls -l "${probe}" 2>/dev/null || true
  rm -rf "${workspace}/engine/target" 2>/dev/null || true
fi

# Scratch trees the live suite creates outside the workspace.
rm -rf "${TMPDIR:-/tmp}"/vaultspec-livetest-* "${RUNNER_TEMP:-/tmp}"/vaultspec-* 2>/dev/null || true
exit 0
