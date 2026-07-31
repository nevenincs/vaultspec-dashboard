// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";

import { threeLab } from "./labMessages";
import { registerLabMessages } from "./registerLabMessages";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "@app/localization/testing";
import type { AnyLabDescriptor } from "./labMessage";
import { APPEARANCE_CONTROL_DEFAULTS } from "@app/scene/three/appearanceControls";
import type { AppearanceParams } from "@app/scene/three/appearance";
import { FORCE_CONTROL_DEFAULTS } from "@app/scene/three/forceControls";
import { THREE_LAB_MESSAGES } from "./threeLabVocabulary";
import { AppearanceControlsPanel } from "./AppearancePanel";
import {
  DEFAULT_PRESET_NAME,
  deletePreset,
  loadPreset,
  savePreset,
  type ForcePresets,
} from "./forcePresets";
import { SimulationPanel } from "./ThreeLab";

const AUTHORED_PRESET = "Équipe 7";

function PanelHarness() {
  const [params, setParams] = useState({ ...FORCE_CONTROL_DEFAULTS });
  const [draft, setDraft] = useState("");
  const [presets, setPresets] = useState<ForcePresets>({
    [AUTHORED_PRESET]: { ...FORCE_CONTROL_DEFAULTS },
  });
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_PRESET_NAME);
  const [feedback, setFeedback] = useState<AnyLabDescriptor | null>(null);
  const [appearance, setAppearance] = useState<AppearanceParams>({
    ...APPEARANCE_CONTROL_DEFAULTS,
  });

  return (
    <>
      <SimulationPanel
        params={params}
        presets={presets}
        selectedPreset={selectedPreset}
        presetDraft={draft}
        feedback={feedback}
        onParamChange={(key, value) =>
          setParams((current) => ({ ...current, [key]: value }))
        }
        onReset={() => setParams({ ...FORCE_CONTROL_DEFAULTS })}
        onLoadPreset={(name) => {
          setSelectedPreset(name);
          setParams(loadPreset(presets, name));
        }}
        onDeletePreset={() => {
          setPresets((current) => deletePreset(current, selectedPreset));
          setSelectedPreset(DEFAULT_PRESET_NAME);
        }}
        onPresetDraftChange={setDraft}
        onSavePreset={() => {
          const name = draft.trim();
          if (!name) return;
          setPresets((current) => savePreset(current, name, params));
          setSelectedPreset(name);
          setDraft("");
        }}
        onCopyLink={() => setFeedback(THREE_LAB_MESSAGES.feedback.linkCopied)}
      />
      <AppearanceControlsPanel
        params={appearance}
        onParamChange={(key, value) =>
          setAppearance((current) => ({ ...current, [key]: value }))
        }
        onReset={() => setAppearance({ ...APPEARANCE_CONTROL_DEFAULTS })}
      />
    </>
  );
}

afterEach(cleanup);

describe("Three Lab panel localization", () => {
  it("updates the mounted production panels across writing directions", async () => {
    const runtime = createTestLocalizationRuntime();
    // The lab's copy is no longer in the catalog a fresh runtime starts from, so the
    // test performs the same registration the app entry does. This keeps the test on
    // the REAL delivery path rather than one that silently already had the keys.
    registerLabMessages(runtime);
    render(
      <I18nextProvider i18n={runtime}>
        <PanelHarness />
      </I18nextProvider>,
    );

    const simulationPanel = screen.getByRole("region", {
      name: threeLab.accessibility.simulationPanel,
    });
    const appearancePanel = screen.getByRole("region", {
      name: threeLab.accessibility.appearancePanel,
    });
    expect(screen.getByText(AUTHORED_PRESET)).toBeTruthy();

    await act(() => runtime.changeLanguage(ltrTestLocale));
    expect(simulationPanel.getAttribute("aria-label")).toBe(
      "Paramètres de mouvement du graphe",
    );
    expect(appearancePanel.getAttribute("aria-label")).toBe(
      "Paramètres d’apparence du graphe",
    );
    expect(
      screen.getByRole("region", { name: "Paramètres de mouvement du graphe" }),
    ).toBe(simulationPanel);

    await act(() => runtime.changeLanguage(rtlTestLocale));
    expect(simulationPanel.getAttribute("aria-label")).toBe(
      "إعدادات حركة الرسم البياني",
    );
    expect(appearancePanel.getAttribute("aria-label")).toBe(
      "إعدادات مظهر الرسم البياني",
    );
    expect(screen.getByText(AUTHORED_PRESET)).toBeTruthy();

    const rendered = document.body.textContent ?? "";
    for (const token of [
      "chargeDistanceMax",
      "dragAndSleep",
      "edgeColorMode",
      "gradient",
      "JSON",
      "?sim=",
      "Feature 0",
      "Doc 0",
    ]) {
      expect(rendered).not.toContain(token);
    }
  });
});
