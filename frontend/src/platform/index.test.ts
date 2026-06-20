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
      "useAction",
      "useCanDispatchAction",
      "useDispatch",
      "useConfirmable",
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

  it("does not publish raw dispatch middleware through the app-facing barrel", () => {
    expect("appDispatcher" in platform).toBe(false);
    expect("appConfirmGuard" in platform).toBe(false);
    expect("createConfirmGuard" in platform).toBe(false);
  });
});
