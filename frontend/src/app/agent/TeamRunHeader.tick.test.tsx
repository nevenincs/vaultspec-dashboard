// @vitest-environment happy-dom
//
// The run header must not run a clock for a time the sibling never sends.
//
// a2a's `RunStatusResponse` serves no start time — not `started_at_ms`, not
// `started_at`, not `created_at` — and it is a FastAPI `response_model`, so an
// extra key could not survive serialization even if something set one. The
// header's elapsed reading is therefore never rendered on a real run. That part
// was always correct and guarded.
//
// The DRIVER was not. A `setInterval(…, 1_000)` was installed for every
// non-terminal run and its `nowMs` had exactly one reader — inside the branch
// that an undefined start time has already excluded. So every active team run
// re-rendered the header, and with it the whole roster, once a second, forever,
// to compute nothing. Two contradicting comments are how it survived review: the
// wire adapter said plainly that a2a serves no start time, while the header
// asserted the opposite two files away.
//
// These tests count REAL intervals. `setInterval` is wrapped in a passthrough
// that still installs the genuine timer and still fires — nothing is faked or
// stubbed, the production code path is unchanged, and the wrapper only records
// that an installation happened. Asserting the rendered output could not catch
// this: a re-render that recomputes an unreadable value looks identical in the
// DOM, which is precisely why it went unnoticed.

import { render, cleanup } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import type { RunProgress, TeamRunStatus } from "../../stores/server/agent/a2aTeam";
import { TeamRunProgressContext } from "./TeamRunProgressContext";
import { TeamRunHeader } from "./TeamRunHeader";
import type { TeamRosterMember } from "./teamRun";

afterEach(cleanup);

const ROSTER: readonly TeamRosterMember[] = [
  { agentId: "vaultspec-researcher", state: "running" },
];

/** Install a counting passthrough over the REAL `setInterval`, returning the
 *  recorded 1 Hz installations and a restore. The genuine timer is still created
 *  and still fires; only the fact of installation is observed. */
function recordIntervals() {
  const real = globalThis.setInterval;
  const delays: number[] = [];
  globalThis.setInterval = ((handler: TimerHandler, timeout?: number, ...rest: unknown[]) => {
    delays.push(timeout ?? 0);
    return real(handler, timeout, ...(rest as []));
  }) as typeof globalThis.setInterval;
  return {
    delays,
    restore: () => {
      globalThis.setInterval = real;
    },
  };
}

function renderHeader(progress: RunProgress) {
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <TeamRunProgressContext.Provider value={progress}>
        <TeamRunHeader roster={ROSTER} />
      </TeamRunProgressContext.Provider>
    </I18nextProvider>,
  );
}

/** A run status shaped like a REAL a2a `run-status`: a served phase, and no start
 *  time of any spelling, because a2a serves none. */
const LIVE_STATUS: TeamRunStatus = {
  run_id: "run-19b53e071e8baf92b20a029c1308828c",
  status: "running",
  semantic_phase: "research",
  proposal_ids: [],
  changeset_ids: [],
  roles: [{ agent_id: "vaultspec-researcher", state: "running" }],
  assignments: [],
};

const LIVE_RUN_AS_A2A_SERVES_IT: RunProgress = {
  frames: [],
  degraded: false,
  terminal: false,
  status: LIVE_STATUS,
};

describe("the run header's elapsed clock", () => {
  it("installs NO ticking interval for a live run a2a serves no start time for", () => {
    const recorder = recordIntervals();
    try {
      renderHeader(LIVE_RUN_AS_A2A_SERVES_IT);
      // The finding: this was one 1000ms interval per active run, forever,
      // re-rendering the header and the whole roster to recompute a value that
      // the `startedAtMs === undefined` guard had already thrown away.
      expect(recorder.delays).toEqual([]);
    } finally {
      recorder.restore();
    }
  });

  it("DOES install the clock once a start time is actually served", () => {
    // The other half of the gate, so the fix is a gate and not a deletion: the
    // render branch and the field are honest forward-compatibility, and a sibling
    // that begins serving a start time gets a live clock with no further change.
    const recorder = recordIntervals();
    try {
      renderHeader({
        ...LIVE_RUN_AS_A2A_SERVES_IT,
        status: { ...LIVE_STATUS, started_at_ms: Date.now() - 5_000 },
      });
      expect(recorder.delays).toEqual([1_000]);
    } finally {
      recorder.restore();
    }
  });

  it("installs no clock for a settled run even with a start time", () => {
    const recorder = recordIntervals();
    try {
      renderHeader({
        ...LIVE_RUN_AS_A2A_SERVES_IT,
        terminal: true,
        status: {
          ...LIVE_STATUS,
          status: "completed",
          started_at_ms: Date.now() - 5_000,
        },
      });
      expect(recorder.delays).toEqual([]);
    } finally {
      recorder.restore();
    }
  });
});
