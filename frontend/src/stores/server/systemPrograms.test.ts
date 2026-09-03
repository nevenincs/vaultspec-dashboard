// Pure-derive contract for the system-status console's program projection.
//
// The console exists to be RELATABLE: every claim it makes must be traceable to
// something the wire carried, and every fact the wire did not carry must be
// stated as unreported rather than blank, zero, or borrowed from a neighbour.
// These tests pin exactly that, because it is the property the owner's review
// note was about and the one a well-meaning refactor would quietly break.
//
// The live half — that the served envelope really does carry the indexing
// program's own port and process id — is proven online in `systemPrograms.live.test.ts`.

import { describe, expect, it } from "vitest";

import {
  deriveSystemPrograms,
  readInstalledVersion,
  type ProgramKey,
  type SystemProgramsInput,
} from "./systemPrograms";

/** A fully-reporting machine: everything the status envelope can carry, present. */
function input(over: Partial<SystemProgramsInput> = {}): SystemProgramsInput {
  return {
    engineUnreachable: false,
    observedRoundTripMs: 7.4,
    degradations: [],
    coreLoading: false,
    coreErrored: false,
    coreReachable: true,
    ragLoading: false,
    ragDegraded: false,
    ragErrored: false,
    ragPort: 8766,
    ragPid: 75828,
    ragInstalledVersion: "vaultspec-rag v0.4.1",
    declaredComponent: {
      name: "core",
      floor: "0.1.36",
      version: "0.1.55",
      meets_floor: true,
    },
    agentComponent: {
      name: "agent",
      floor: "v1",
      version: null,
      ...{
        installed: true,
        gateway: { endpoint: "127.0.0.1:8823", pid: 41288, ownership: "owned" },
        release_set: { version: "0.3.2" },
      },
    } as SystemProgramsInput["declaredComponent"],
    agentAvailable: true,
    ...over,
  };
}

function program(view: ReturnType<typeof deriveSystemPrograms>, key: ProgramKey) {
  const row = view.programs.find((entry) => entry.key === key);
  if (row === undefined) throw new Error(`no program row for ${key}`);
  return row;
}

function factValue(
  view: ReturnType<typeof deriveSystemPrograms>,
  key: ProgramKey,
  factKey: string,
): string | null | undefined {
  return program(view, key).facts.find((fact) => fact.key === factKey)?.value;
}

describe("deriveSystemPrograms", () => {
  it("separates the programs from the reads the app's own server answers", () => {
    const view = deriveSystemPrograms(input());
    // A row you cannot point at a process for is not a program. Documents, links
    // and history are reads of the one server, and listing them beside real
    // programs is what made the old console unrelatable.
    expect(view.programs.map((row) => row.key)).toEqual([
      "app",
      "projectTools",
      "index",
      "agents",
    ]);
    expect(view.reads.map((row) => row.key)).toEqual(["documents", "links", "history"]);
  });

  it("states the indexing program's own port and process id", () => {
    const view = deriveSystemPrograms(input());
    expect(factValue(view, "index", "port")).toBe("8766");
    expect(factValue(view, "index", "process")).toBe("75828");
  });

  it("renders a port and a process id verbatim, never group-separated", () => {
    // They are identifiers, not quantities: "8,766" names no port.
    const view = deriveSystemPrograms(input({ ragPort: 18767, ragPid: 1234567 }));
    expect(factValue(view, "index", "port")).toBe("18767");
    expect(factValue(view, "index", "process")).toBe("1234567");
  });

  it("keeps the package name out of a version it renders", () => {
    // The provisioning projection prefixes the package name onto the version, and
    // the package name is exactly what the labels law keeps off screen.
    expect(readInstalledVersion("vaultspec-rag v0.4.1")).toBe("0.4.1");
    expect(readInstalledVersion("0.4.1")).toBe("0.4.1");
    expect(readInstalledVersion(null)).toBeNull();
    expect(readInstalledVersion("   ")).toBeNull();
    const view = deriveSystemPrograms(input());
    expect(JSON.stringify(view)).not.toContain("vaultspec-rag");
  });

  it("drops a fact the wire did not carry instead of printing a placeholder", () => {
    const view = deriveSystemPrograms(
      input({ ragPort: undefined, ragPid: undefined, ragInstalledVersion: null }),
    );
    expect(program(view, "index").facts).toEqual([]);
    // The row still says what it does not report, so the absence is a statement.
    expect(program(view, "index").gap).not.toBeNull();
  });

  it("never turns an absent port or process id into a zero", () => {
    const view = deriveSystemPrograms(input({ ragPort: undefined, ragPid: undefined }));
    const facts = program(view, "index").facts;
    expect(facts.map((fact) => fact.value)).not.toContain("0");
  });

  it("measures the app server's round trip and rounds it to whole milliseconds", () => {
    // The one fact no route can serve: the engine cannot observe a browser's own
    // round trip, so it is measured, and it is the only measured value here.
    expect(factValue(deriveSystemPrograms(input()), "app", "responseTime")).toBe("7");
    expect(
      factValue(
        deriveSystemPrograms(input({ observedRoundTripMs: null })),
        "app",
        "responseTime",
      ),
    ).toBeUndefined();
    expect(
      factValue(
        deriveSystemPrograms(input({ observedRoundTripMs: Number.NaN })),
        "app",
        "responseTime",
      ),
    ).toBeUndefined();
  });

  it("names what each program does not report", () => {
    const view = deriveSystemPrograms(input());
    for (const key of ["app", "projectTools", "index", "agents"] as const) {
      expect(program(view, key).gap, key).not.toBeNull();
    }
  });

  it("reports the project tools by version and required floor", () => {
    const view = deriveSystemPrograms(input());
    expect(factValue(view, "projectTools", "version")).toBe("0.1.55");
    expect(factValue(view, "projectTools", "requires")).toBe("0.1.36");
    // It runs as a command, so it never claims an address or a process id.
    expect(factValue(view, "projectTools", "port")).toBeUndefined();
    expect(factValue(view, "projectTools", "address")).toBeUndefined();
  });

  it("states the agent program's discovered address, process, and version", () => {
    const view = deriveSystemPrograms(input());
    expect(factValue(view, "agents", "address")).toBe("127.0.0.1:8823");
    expect(factValue(view, "agents", "process")).toBe("41288");
    expect(factValue(view, "agents", "version")).toBe("0.3.2");
  });

  it("maps the ownership word to plain language and drops an unknown one", () => {
    const owned = deriveSystemPrograms(input());
    const managedBy = program(owned, "agents").facts.find(
      (fact) => fact.key === "managedBy",
    );
    expect(managedBy?.word?.key).toBe("common:systemStatus.ownership.thisApp");

    // A newer engine must not be able to make this client print a raw wire word.
    const unknown = deriveSystemPrograms(
      input({
        agentComponent: {
          name: "agent",
          floor: "v1",
          version: null,
          ...{ installed: true, gateway: { ownership: "some-future-verdict" } },
        } as SystemProgramsInput["declaredComponent"],
      }),
    );
    expect(
      program(unknown, "agents").facts.some((fact) => fact.key === "managedBy"),
    ).toBe(false);
    expect(JSON.stringify(unknown)).not.toContain("some-future-verdict");
  });

  it("checks rather than claiming a failure it has not observed yet", () => {
    // Before the first snapshot settles, no row may assert a failure.
    const view = deriveSystemPrograms(
      input({
        coreLoading: true,
        ragLoading: true,
        agentComponent: undefined,
        agentAvailable: false,
      }),
    );
    expect(view.programs.every((row) => row.tone === "unknown")).toBe(true);
    expect(program(view, "agents").status.key).toBe(
      "common:systemStatus.states.checking",
    );
  });

  it("distinguishes an uninstalled agent program from a failed one", () => {
    // "Not installed" and "Unavailable" read very differently to anyone
    // troubleshooting, so they stay distinct words.
    const absent = deriveSystemPrograms(
      input({
        agentComponent: {
          name: "agent",
          floor: "v1",
          version: null,
          ...{ installed: false },
        } as SystemProgramsInput["declaredComponent"],
        agentAvailable: false,
      }),
    );
    expect(program(absent, "agents").status.key).toBe(
      "common:systemStatus.states.notInstalled",
    );
    const failed = deriveSystemPrograms(input({ agentAvailable: false }));
    expect(program(failed, "agents").status.key).toBe(
      "common:systemStatus.states.unavailable",
    );
  });

  it("cascades every row down when the app's own server is unreachable", () => {
    const view = deriveSystemPrograms(input({ engineUnreachable: true }));
    expect(view.programs.every((row) => row.tone === "down")).toBe(true);
    expect(view.reads.every((row) => row.tone === "down")).toBe(true);
  });

  it("marks a served-degraded read unavailable, leaving its siblings available", () => {
    const view = deriveSystemPrograms(input({ degradations: ["structural"] }));
    expect(view.reads.find((row) => row.key === "documents")?.tone).toBe("down");
    expect(view.reads.find((row) => row.key === "links")?.tone).toBe("ok");
  });

  it("never leaks a served reason or a raw wire word onto a row", () => {
    const view = deriveSystemPrograms(
      input({ ragDegraded: true, ragErrored: false, ragInstalledVersion: null }),
    );
    expect(program(view, "index").tone).toBe("down");
    // Status is a closed vocabulary; a served explanation never becomes copy.
    expect(program(view, "index").status.key).toBe(
      "common:systemStatus.states.unavailable",
    );
  });

  it("bounds every free-form served string it renders", () => {
    const long = "x".repeat(500);
    const view = deriveSystemPrograms(
      input({
        agentComponent: {
          name: "agent",
          floor: "v1",
          version: null,
          ...{ installed: true, gateway: { endpoint: long } },
        } as SystemProgramsInput["declaredComponent"],
      }),
    );
    expect(factValue(view, "agents", "address")).toBeUndefined();
  });
});
