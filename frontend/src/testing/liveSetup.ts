// Per-worker test setup: point the app-wide engine client at the live engine.
//
// The singleton `engineClient` the stores hooks use defaults to a browser
// fetch against the relative `/api` origin, which does not resolve in the node
// test environment. Binding it to the live transport once per worker means
// every hook-driven test speaks to the real spawned engine with no per-test
// transport wiring — and there is no mock to leak between suites.

import { engineClient } from "../stores/server/engine";
import { liveTransport } from "./liveClient";

engineClient.useTransport(liveTransport);
