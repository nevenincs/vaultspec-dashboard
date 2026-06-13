import { describe, expect, it } from "vitest";

import * as platform from "./index";

describe("platform public API barrel", () => {
  it("re-exports the four pillars' entry points", () => {
    const expected = [
      // observability
      "logger",
      "createLogger",
      "RingBufferSink",
      "installGlobalTraps",
      "isWorkerLogEnvelope",
      "postWorkerLog",
      // containment
      "ErrorBoundary",
      "CrashInjector",
      "CrashZone",
      "useCrashStore",
      // dispatch
      "Dispatcher",
      "appDispatcher",
      "useAction",
      "useDispatch",
      "useConfirmable",
      "createConfirmGuard",
      // policy
      "classifyError",
      "failurePolicy",
      "queryErrorRouter",
      "useFailurePolicy",
      "StreamLostError",
      "WorkerCrashError",
    ] as const;
    for (const name of expected) {
      expect(platform[name], name).toBeDefined();
    }
  });
});
