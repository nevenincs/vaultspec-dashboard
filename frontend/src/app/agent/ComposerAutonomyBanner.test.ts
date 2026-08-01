// Autonomy-banner presence rules (research C7; plan P06.S24). Pure — the served
// mode is the only input, so the rules can be pinned without a wire or a render.
//
// The banner is the product's loudest safety notice: it is the one thing standing
// between "the agent will apply changes without asking" and a user who has
// forgotten. So the interesting cases are the ones where it must NOT appear (a mode
// we cannot name is not a licence to warn) and the one where it must come back.

import { describe, expect, it } from "vitest";

import { autonomyBannerVisible } from "./ComposerAutonomyBanner";

describe("autonomyBannerVisible", () => {
  it("warns only for the mode that actually elevates autonomy", () => {
    expect(autonomyBannerVisible("autonomous", false)).toBe(true);
    // `manual` asks every time — there is nothing standing to warn about.
    expect(autonomyBannerVisible("manual", false)).toBe(false);
    // `assisted` is a served mode the two-segment control deliberately shows as
    // neither option. Warning about it would be asserting a policy we are not
    // rendering anywhere else.
    expect(autonomyBannerVisible("assisted", false)).toBe(false);
    // No served mode at all: the control itself hides in this state, and a banner
    // about an unobservable policy would be a fabrication.
    expect(autonomyBannerVisible(null, false)).toBe(false);
  });

  it("honours a dismissal only while the elevation it was shown for lasts", () => {
    expect(autonomyBannerVisible("autonomous", true)).toBe(false);
    // Leaving autonomous re-arms (the component clears the flag on the mode
    // change), so a later return to apply-automatically warns again rather than
    // staying permanently silenced by one old click.
    expect(autonomyBannerVisible("manual", true)).toBe(false);
    expect(autonomyBannerVisible("autonomous", false)).toBe(true);
  });
});
