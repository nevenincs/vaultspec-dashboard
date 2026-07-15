// Reload provider unit (global-context-actions): the client-side Refresh command is a
// pure function of the injected CommandContext, composing the SHARED refreshDataAction
// builder under the reload family. The cross-plane id identity (palette + keymap + tail)
// is enforced separately by actionCoverage.guard.test.ts.

import { describe, expect, it } from "vitest";
import { RefreshCw } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import {
  RELOAD_REFRESH_DATA_ACTION_ID,
  RELOAD_REFRESH_DATA_LABEL,
} from "../reloadKeybindings";
import { reloadCommandProvider } from "./reloadCommandProvider";

type RawCommand = Partial<ActionDescriptor> & { family?: string };

describe("reloadCommandProvider", () => {
  it("contributes the shared Refresh command under the reload family", () => {
    const out = reloadCommandProvider().map((c) => c as RawCommand);
    expect(out.map((c) => c.id)).toEqual([RELOAD_REFRESH_DATA_ACTION_ID]);
    const command = out[0]!;
    expect(command.label).toBe(RELOAD_REFRESH_DATA_LABEL);
    expect(command).toMatchObject({
      family: "reload",
      icon: RefreshCw,
    });
    expect(typeof command.run).toBe("function");
    expect(Object.hasOwn(command, "confirm")).toBe(false);
    expect(Object.hasOwn(command, "disabledInTimeTravel")).toBe(false);
  });
});
