// Per-worker test setup: point the app-wide engine client at the live engine.
//
// The singleton `engineClient` the stores hooks use defaults to a browser
// fetch against the relative `/api` origin, which does not resolve in the node
// test environment. Binding it to the live transport once per worker means
// every hook-driven test speaks to the real spawned engine with no per-test
// transport wiring — and there is no mock to leak between suites.

import { engineClient } from "../stores/server/engine";
import { authoringClient } from "../stores/server/authoring";
import { agentClient, a2aTeamClient } from "../stores/server/agent";
import { liveTransport } from "./liveClient";

// A failure dump that stops before the component under test is not evidence.
// @testing-library/dom truncates `prettyDOM` at `DEBUG_PRINT_LIMIT || 7000`
// characters, and this app's dialogs and panels exceed that well before the
// element an assertion names: a folder-picker failure printed the overlay, the
// header and part of the places rail, then ` ...`, with the folder browser the
// assertion was about never reaching the log. Every such run costs a round trip
// to reproduce, and reading the truncation as "the element is absent" is a
// mistake the dump invites. 40000 covers one dialog subtree whole.
process.env.DEBUG_PRINT_LIMIT ??= "40000";

engineClient.useTransport(liveTransport);
// Bind the authoring client to the same live transport so render tests that fire
// mutations through usePlanStepTick speak to the real engine (authoring-surface D1).
authoringClient.useTransport(liveTransport);
// Bind the agent-conversation client so panel and chip tests read sessions and
// runs from the real engine.
agentClient.useTransport(liveTransport);
// Bind the a2a team client — the FOURTH singleton wire client. Without this its
// `/ops/a2a/*` queries and the run-relay SSE fall to the default bearer transport,
// which resolves the relative `/api` path against happy-dom's `localhost:3000`
// origin; the resulting ECONNREFUSED retry loop outlives its owning test and bleeds
// a port-3000 failure into whatever sibling test is running (AgentPanel mounts
// `useActiveTeamRuns`/`useRunRelay`). Routing it at the same seam as the others
// keeps every wire client on the spawned engine — no mock, no default origin.
a2aTeamClient.useTransport(liveTransport);
