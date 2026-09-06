import { describe, expect, it, vi } from "vitest";

import {
  observeUnexpectedEngineExit,
  unexpectedEngineExitDiagnostic,
  UNEXPECTED_EXIT_LOG_TAIL_CHARS,
} from "./liveEngine.globalSetup";

describe("live-engine unexpected-exit diagnostics", () => {
  it("reports code, signal, elapsed runtime, and the serve-log tail", () => {
    const diagnostic = unexpectedEngineExitDiagnostic({
      expected: false,
      code: 17,
      signal: "SIGTERM",
      elapsedMs: 12_345.9,
      serveLog: "engine stderr",
    });

    expect(diagnostic).toContain("code=17");
    expect(diagnostic).toContain("signal=SIGTERM");
    expect(diagnostic).toContain("elapsed_ms=12345");
    expect(diagnostic).toContain("serve-log tail (13 chars):\nengine stderr");
  });

  it("bounds diagnostics to the newest serve-log characters", () => {
    const omitted = "old:";
    const retained = "n".repeat(UNEXPECTED_EXIT_LOG_TAIL_CHARS);
    const diagnostic = unexpectedEngineExitDiagnostic({
      expected: false,
      code: null,
      signal: null,
      elapsedMs: -1,
      serveLog: omitted + retained,
    });

    expect(diagnostic).toContain("code=null signal=null elapsed_ms=0");
    expect(diagnostic).toContain(
      `serve-log tail (${UNEXPECTED_EXIT_LOG_TAIL_CHARS} chars):`,
    );
    expect(diagnostic).not.toContain(omitted);
    expect(diagnostic?.endsWith(retained)).toBe(true);
  });

  it("stays silent for harness-requested shutdown", () => {
    expect(
      unexpectedEngineExitDiagnostic({
        expected: true,
        code: 0,
        signal: null,
        elapsedMs: 100,
        serveLog: "ordinary shutdown",
      }),
    ).toBeUndefined();
  });

  it("reports a child exit through one bounded observer", () => {
    let exitListener:
      | ((code: number | null, signal: NodeJS.Signals | null) => void)
      | undefined;
    const child = {
      once: vi.fn(
        (
          _event: "exit",
          listener: (code: number | null, signal: NodeJS.Signals | null) => void,
        ) => {
          exitListener = listener;
        },
      ),
    };
    const report = vi.fn();

    observeUnexpectedEngineExit(
      child,
      (code, signal) => ({
        expected: false,
        code,
        signal,
        elapsedMs: 42,
        serveLog: "tail",
      }),
      report,
    );
    exitListener?.(9, "SIGKILL");

    expect(child.once).toHaveBeenCalledOnce();
    expect(child.once).toHaveBeenCalledWith("exit", expect.any(Function));
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining("code=9 signal=SIGKILL elapsed_ms=42"),
    );
  });
});
