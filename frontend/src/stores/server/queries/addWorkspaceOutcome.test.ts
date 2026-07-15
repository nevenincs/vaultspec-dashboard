import { describe, expect, it } from "vitest";

import { EngineError } from "../engine";
import { classifyAddWorkspaceError } from "./workspaces";

function sessionRefusal(errorKind: string): EngineError {
  return new EngineError("/session", 400, {
    body: { error_kind: errorKind, error: "diagnostic text must stay internal" },
  });
}

describe("add-workspace outcome classification", () => {
  it("maps only the closed session refusal vocabulary", () => {
    expect(classifyAddWorkspaceError(sessionRefusal("not_a_directory"))).toBe(
      "folderUnavailable",
    );
    expect(classifyAddWorkspaceError(sessionRefusal("unreadable"))).toBe(
      "folderUnavailable",
    );
    expect(classifyAddWorkspaceError(sessionRefusal("not_a_git_workspace"))).toBe(
      "notGitProject",
    );
    expect(classifyAddWorkspaceError(sessionRefusal("already_registered"))).toBe(
      "alreadyAdded",
    );
  });

  it("maps unknown, wrong-route, wrong-status, and transport failures to addFailed", () => {
    expect(classifyAddWorkspaceError(sessionRefusal("future_kind"))).toBe("addFailed");
    expect(
      classifyAddWorkspaceError(
        new EngineError("/workspaces", 400, {
          body: { error_kind: "not_a_directory" },
        }),
      ),
    ).toBe("addFailed");
    expect(
      classifyAddWorkspaceError(
        new EngineError("/session", 500, {
          body: { error_kind: "not_a_directory" },
        }),
      ),
    ).toBe("addFailed");
    expect(classifyAddWorkspaceError(new TypeError("network failed"))).toBe(
      "addFailed",
    );
  });
});
