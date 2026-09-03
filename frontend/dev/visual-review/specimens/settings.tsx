// Specimens: `settings` area — the schema-driven dialog and its Advanced section.
//
// The dialog's whole body is a SERVED registry read: the engine declares every
// setting once (`settings_schema.rs`), and the dialog renders whatever the schema
// carries joined against the current values. So its four states are genuinely
// different reads rather than four dressings of one payload — a populated
// registry, a registry still in flight, a registry that declared nothing, and a
// settings plane reporting itself unavailable.
//
// Advanced is the operational home hosting the index console, the system-status
// block and the project-health block. Its folds are MOUNT GATES, so the authored
// states here differ by which fold is expanded, not by seeding console data: a
// collapsed fold renders nothing at all, which is the point of the gate.

import { useEffect } from "react";

import { engineKeys } from "@app/stores/server/queries";
import type {
  SettingDef,
  SettingsSchema,
  SettingsState,
} from "@app/stores/server/engine";
import {
  collapseAdvancedConsoles,
  expandAdvancedConsole,
} from "@app/stores/view/advancedConsole";
import {
  closeSettingsDialog,
  openSettingsDialog,
} from "@app/stores/view/settingsDialog";
import { AdvancedSection } from "@app/app/settings/AdvancedSection";
import { SettingsDialog } from "@app/app/settings/SettingsDialog";

import type { SpecimenDef } from "../registry";
import type { ReviewState } from "../state";
import { seedSessionAndDashboardState, tiersDown, tiersHealthy } from "./support";

// --- authored registry ----------------------------------------------------------------

/** Three declared settings across two groups — enough that the dialog renders a
 *  grouped body with all three control kinds it supports, from the same shape the
 *  engine's registry serves. */
const SETTING_DEFS: SettingDef[] = [
  {
    key: "appearance.theme",
    value_type: { type: "enum", members: ["system", "light", "dark"] },
    default: "system",
    scope_eligible: false,
    control: "segmented",
    display: {
      id: "appearance.theme",
      group: "appearance",
      enum_members: [
        { value: "system", label: { key: "settings:options.system" } },
        { value: "light", label: { key: "settings:options.light" } },
        { value: "dark", label: { key: "settings:options.dark" } },
      ],
    },
    order: 1,
  },
  {
    key: "appearance.reduce_motion",
    value_type: { type: "bool" },
    default: "false",
    scope_eligible: false,
    control: "switch",
    display: { id: "appearance.reduceMotion", group: "appearance", enum_members: [] },
    order: 2,
  },
  {
    key: "graph.label_density",
    value_type: { type: "int", min: 0, max: 100 },
    default: "60",
    scope_eligible: true,
    control: "slider",
    display: { id: "graph.labelDensity", group: "graph", enum_members: [] },
    order: 3,
    step: 10,
    unit: "%",
  },
] as unknown as SettingDef[];

function schema(
  defs: SettingDef[],
  tiers = tiersHealthy("structural"),
): SettingsSchema {
  return {
    settings: defs,
    groups: [...new Set(defs.map((def) => def.display.group))],
    tiers,
  };
}

function values(tiers = tiersHealthy("structural")): SettingsState {
  return {
    global: { "appearance.theme": "dark", "appearance.reduce_motion": "false" },
    scoped: {},
    tiers,
  };
}

/** Opens the dialog on mount through the real store action and closes it on
 *  unmount — the view store is a module singleton shared by every cell, so a state
 *  switch must never leak an open dialog into the next specimen. */
function SettingsDialogSpecimen() {
  useEffect(() => {
    openSettingsDialog();
    return () => closeSettingsDialog();
  }, []);
  return <SettingsDialog />;
}

/** Advanced's states differ by which console is expanded, because expansion IS the
 *  mount gate. `empty` is every fold collapsed — the honest resting state a user
 *  meets on opening Settings, where no console has mounted and nothing polls. */
function AdvancedSectionSpecimen({ state }: { state: ReviewState }) {
  useEffect(() => {
    if (state === "empty") collapseAdvancedConsoles();
    else expandAdvancedConsole(state === "degraded" ? "system" : "index");
    return () => collapseAdvancedConsoles();
  }, [state]);
  return <AdvancedSection />;
}

export const settingsSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "settings-settingsdialog": {
    solo: true,
    host: "h-[34rem] w-[34rem] relative",
    note: "Container, portalled: a local wrapper opens it via the real openSettingsDialog() action on mount and closes it on unmount. The body is the SERVED registry — engineKeys.settingsSchema() joined against engineKeys.settings() — so the states are four different reads. 'normal' seeds a three-setting registry across two groups, exercising all three control kinds (segmented, switch, slider) against current values. 'loading' leaves the schema key unseeded so the dialog's own pending body renders. 'empty' seeds a registry that declared NOTHING, which is the honest 'no settings' body rather than a blank dialog. 'degraded' seeds a tiers-down schema — the settings plane reporting itself unavailable.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client);
      if (state === "loading") return;
      if (state === "degraded") {
        client.setQueryData(
          engineKeys.settingsSchema(),
          schema(SETTING_DEFS, tiersDown(["structural"])),
        );
        client.setQueryData(engineKeys.settings(), values(tiersDown(["structural"])));
        return;
      }
      client.setQueryData(
        engineKeys.settingsSchema(),
        schema(state === "empty" ? [] : SETTING_DEFS),
      );
      client.setQueryData(engineKeys.settings(), values());
    },
    render: () => <SettingsDialogSpecimen />,
  },

  "settings-advancedsection": {
    host: "w-[32rem]",
    note: "The operational home: three folds (index console, system status, project health), at most one expanded. Expansion is the MOUNT GATE, so these cells differ by WHICH fold is open rather than by console data — a collapsed fold renders nothing and none of its polls run. 'normal' and 'loading' expand the index console (unseeded reads inside it stay honestly pending, which is that console's own loading state); 'degraded' expands system status over a tiers-down status read; 'empty' collapses everything, the resting state a user meets on opening Settings before touching anything.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client);
      if (state === "degraded") {
        client.setQueryData(engineKeys.status(), {
          tiers: tiersDown(["structural"]),
        });
      }
    },
    render: (state) => <AdvancedSectionSpecimen state={state} />,
  },
};
