#!/usr/bin/env bash
# Absorb a transient network fault while provisioning the Rust toolchain.
#
# `dtolnay/rust-toolchain` fetches through rustup and does not retry, so a
# `socket hang up` aborts the job before the suite starts. The check goes red,
# reads exactly like a test failure, and says nothing about the code — the
# failure class the runner-instability issue is about.
#
# rustup's install is idempotent: installing a toolchain that is already present
# is a no-op. So warming it here first means the action's own fetch finds
# everything in place and touches the network only when this did not succeed.
#
# Deliberately dependency-free. The alternative was a third-party retry action,
# which is a supply-chain decision rather than a fix, and this needs no new
# trust. It also cannot make anything worse: every failure path exits 0 and
# leaves the action to provision exactly as it does today.
set -uo pipefail

channel="${1:-}"
if [ -z "${channel}" ]; then
  echo "warm-toolchain: no channel given — leaving provisioning to the action"
  exit 0
fi
if ! command -v rustup >/dev/null 2>&1; then
  echo "warm-toolchain: no rustup on PATH — leaving provisioning to the action"
  exit 0
fi

attempts="${WARM_TOOLCHAIN_ATTEMPTS:-3}"
for attempt in $(seq 1 "${attempts}"); do
  if rustup toolchain install "${channel}" --profile minimal --no-self-update; then
    echo "warm-toolchain: ${channel} present after attempt ${attempt}"
    exit 0
  fi
  if [ "${attempt}" -lt "${attempts}" ]; then
    # Linear backoff. The fault this absorbs is a dropped connection, which
    # clears in seconds; a longer wait would just add latency to a job that is
    # already the slow one.
    delay=$((attempt * 5))
    echo "warm-toolchain: attempt ${attempt} failed — retrying in ${delay}s"
    sleep "${delay}"
  fi
done

# Never fail the job. If the toolchain genuinely cannot be fetched, the action
# that follows will say so in its own terms; this step going red would replace
# one clear failure with a confusing one.
echo "warm-toolchain: ${attempts} attempts did not settle it — leaving it to the action"
exit 0
