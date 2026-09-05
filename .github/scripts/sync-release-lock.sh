#!/usr/bin/env bash
# Regenerate engine/Cargo.lock after release-please bumps the workspace version.
#
# The caller has already checked out the release branch; this only refreshes the
# lock and pushes it back if it moved.
#
# `cargo metadata` resolves the dependency graph without building, so it is
# cheap. It runs `--offline` deliberately: the only edit this needs is the
# workspace version rewrite, and a lock refresh inside the release job must
# never quietly become an unreviewed dependency update.
set -euo pipefail

branch="${RELEASE_BRANCH:-}"
if [ -z "${branch}" ]; then
  echo "::error::RELEASE_BRANCH is empty; refusing to push a lock to an unknown branch" >&2
  exit 1
fi

cargo metadata --offline --format-version 1 --manifest-path engine/Cargo.toml > /dev/null

if git diff --quiet -- engine/Cargo.lock; then
  echo "engine/Cargo.lock already agrees with engine/Cargo.toml; nothing to do"
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add engine/Cargo.lock
git commit -m "chore(release): carry engine/Cargo.lock with the version bump"
git push origin "HEAD:${branch}"
echo "engine/Cargo.lock synced onto ${branch}"
