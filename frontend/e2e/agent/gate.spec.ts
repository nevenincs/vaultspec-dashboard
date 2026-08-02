// The explicit substrate gate for the real two-process agent lane.  This is
// intentionally the one allowed skipped result: without a pinned A2A source
// checkout the lane did not execute and must not look like a pass.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

const A2A_ROOT_ENV = "VAULTSPEC_TEST_A2A_ROOT";

test("agent lane reports missing A2A source as skipped, never passed", () => {
  const configured = process.env[A2A_ROOT_ENV];
  test.skip(
    !configured,
    `${A2A_ROOT_ENV} is absent; real agent integration substrate was not run`,
  );

  // If the skip above is removed, an absent substrate is a red result rather
  // than a fabricated pass. With it present, validate the same source contract
  // the real harness requires before later agent specs are allowed to run.
  expect(configured, `${A2A_ROOT_ENV} must be non-empty`).toBeTruthy();
  expect(existsSync(join(resolve(configured!), "pyproject.toml"))).toBe(true);
});
