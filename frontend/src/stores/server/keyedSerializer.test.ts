import { describe, expect, it } from "vitest";

import { createKeyedSerializer } from "./keyedSerializer";

describe("createKeyedSerializer", () => {
  it("orders one key while allowing another key to begin independently", async () => {
    const serializer = createKeyedSerializer<string>();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = serializer.run("scope-a", async () => {
      events.push("a:first:start");
      await firstGate;
      events.push("a:first:end");
    });
    const second = serializer.run("scope-a", async () => events.push("a:second"));
    const other = serializer.run("scope-b", async () => events.push("b:first"));

    await other;
    expect(events).toEqual(["a:first:start", "b:first"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["a:first:start", "b:first", "a:first:end", "a:second"]);
  });

  it("continues after rejection and lets only the current tail settle the key", async () => {
    const serializer = createKeyedSerializer<string>();
    const settled: string[] = [];
    let releaseSecond!: () => void;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    const rejected = serializer.run("scope", async () => {
      throw new Error("first write refused");
    });
    const second = serializer.run(
      "scope",
      async () => {
        await secondGate;
        return "second";
      },
      { onCurrentSettled: () => settled.push("second") },
    );

    await expect(rejected).rejects.toThrow("first write refused");
    expect(settled).toEqual([]);
    releaseSecond();
    await expect(second).resolves.toBe("second");
    expect(settled).toEqual(["second"]);
  });
});
