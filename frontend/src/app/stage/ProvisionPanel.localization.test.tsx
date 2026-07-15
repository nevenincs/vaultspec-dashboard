// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import type { ProvisionStatus } from "../../stores/server/engine";
import { sourceLocale } from "../../locales/en";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { ProvisionPanelBody } from "./ProvisionPanel";

afterEach(cleanup);

const noOp = () => undefined;

function status(): ProvisionStatus {
  return {
    target: "/hostile/private/path",
    managed: false,
    recommended: "install-framework",
    git: { present: true },
    uv: { present: true, version: "hostile-tool-version" },
    core: {
      version: "hostile-core-version",
      floor: "internal-floor",
      meets_floor: true,
    },
    rag: {
      tool_version: "hostile-rag-version",
      floor: "internal-floor",
      enrolled: true,
    },
    framework: {
      vaultspec_present: true,
      vault_present: false,
      providers: ["hostile-provider"],
    },
    pending_migrations: ["hostile-migration"],
  };
}

describe("ProvisionPanel localization", () => {
  it.each([
    [sourceLocale, "Project setup required", "Set up project"],
    [ltrTestLocale, "Configuration du projet requise", "Configurer le projet"],
    [rtlTestLocale, "إعداد المشروع مطلوب", "إعداد المشروع"],
  ] as const)(
    "renders genuine %s catalog copy without project metadata",
    (locale, title, action) => {
      const runtime = createTestLocalizationRuntime(locale);
      const { container } = render(
        <I18nextProvider i18n={runtime}>
          <ProvisionPanelBody
            data={status()}
            job={undefined}
            busy={false}
            runError={false}
            onPrimary={noOp}
            onForce={noOp}
          />
        </I18nextProvider>,
      );

      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByRole("button", { name: action })).toBeTruthy();
      expect(container.textContent).not.toContain("/hostile/private/path");
      expect(container.textContent).not.toContain("hostile-tool-version");
      expect(container.textContent).not.toContain("hostile-core-version");
      expect(container.textContent).not.toContain("hostile-rag-version");
      expect(container.textContent).not.toContain("hostile-provider");
      expect(container.textContent).not.toContain("hostile-migration");
    },
  );
});
