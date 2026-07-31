// The lab supplies its OWN copy at runtime.
//
// `graph:lab.*` used to be compiled into the shipped `en` catalog via
// `src/locales/en/graph.ts`, so ~90 dev-only strings rode along in every production
// bundle. The keys are unchanged — only their delivery moved — so no lab component
// needed rewriting.
//
// Production never calls this, so production never carries the copy.

import type { i18n } from "i18next";

import { ltrThreeLabResources, rtlThreeLabResources } from "./labAltLocaleResources";
import { threeLab } from "./labMessages";

/**
 * Register the lab's `graph:lab.*` subtree on a localization runtime.
 *
 * `deep` and `overwrite` are both true, and both matter: the `graph` namespace already
 * exists (it ships), so this must merge INTO it. A shallow register would replace the
 * namespace outright and wipe every production graph string.
 *
 * Call this before first render — the app entry does, and any test building its own
 * runtime must too, since the keys are no longer in the catalog it starts from.
 */
export function registerLabMessages(instance: i18n): void {
  instance.addResourceBundle("en", "graph", { lab: threeLab }, true, true);
  // The alternate-locale bundles back the lab's own localization test and the RTL/LTR
  // passes; keeping all three locales here means one place to look.
  instance.addResourceBundle("fr", "graph", { lab: ltrThreeLabResources }, true, true);
  instance.addResourceBundle("ar", "graph", { lab: rtlThreeLabResources }, true, true);
}
