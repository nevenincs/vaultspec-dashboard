import { describe, expect, it } from "vitest";

import { WATCHER_COOLDOWN_S_MAX, WATCHER_DEBOUNCE_MS_MAX } from "../server/ragControl";
import { watcherReconfigureArgsFromDraft } from "./ragWatcherConfigDraft";

describe("rag watcher config draft", () => {
  it("converts valid string drafts into watcher reconfigure args", () => {
    expect(
      watcherReconfigureArgsFromDraft({ debounce: "250", cooldown: "3.5" }),
    ).toEqual({
      debounce_ms: 250,
      cooldown_s: 3.5,
    });
  });

  it("drops blank or invalid drafts instead of mirroring invalid form state", () => {
    expect(watcherReconfigureArgsFromDraft({ debounce: "", cooldown: "" })).toEqual({});
    expect(
      watcherReconfigureArgsFromDraft({ debounce: "12.5", cooldown: "-1" }),
    ).toEqual({});
    expect(
      watcherReconfigureArgsFromDraft({ debounce: "not-a-number", cooldown: "5" }),
    ).toEqual({ cooldown_s: 5 });
  });

  it("drops watcher drafts outside the brokered backend bounds", () => {
    expect(
      watcherReconfigureArgsFromDraft({
        debounce: String(WATCHER_DEBOUNCE_MS_MAX),
        cooldown: String(WATCHER_COOLDOWN_S_MAX),
      }),
    ).toEqual({
      debounce_ms: WATCHER_DEBOUNCE_MS_MAX,
      cooldown_s: WATCHER_COOLDOWN_S_MAX,
    });
    expect(
      watcherReconfigureArgsFromDraft({
        debounce: String(WATCHER_DEBOUNCE_MS_MAX + 1),
        cooldown: String(WATCHER_COOLDOWN_S_MAX + 0.5),
      }),
    ).toEqual({});
  });
});
