import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  TIMELINE_DATE_CRITERIA,
  TIMELINE_DATE_CRITERION_DEFAULT,
  TIMELINE_DATE_CRITERION_MESSAGES,
  TIMELINE_DATE_CRITERION_PRESENTATION,
  timelineDateCriterionIsAvailable,
  timelineDateCriterionLabel,
  timelineDateCriterionPresentation,
} from "./timelineDateCriterion";

describe("timeline date criterion presentation", () => {
  it("preserves raw ids, order, default, and stable presentation identities", () => {
    expect(TIMELINE_DATE_CRITERIA).toEqual(["created", "modified", "stamped"]);
    expect(TIMELINE_DATE_CRITERION_DEFAULT).toBe("created");
    expect(Object.isFrozen(TIMELINE_DATE_CRITERIA)).toBe(true);
    expect(Object.isFrozen(TIMELINE_DATE_CRITERION_PRESENTATION)).toBe(true);
    expect(timelineDateCriterionPresentation("created")).toBe(
      TIMELINE_DATE_CRITERION_PRESENTATION.created,
    );
    expect(timelineDateCriterionPresentation("modified")).toBe(
      TIMELINE_DATE_CRITERION_PRESENTATION.modified,
    );
    expect(timelineDateCriterionPresentation("stamped")).toBe(
      TIMELINE_DATE_CRITERION_PRESENTATION.stamped,
    );
    expect(timelineDateCriterionLabel("created")).toBe(
      TIMELINE_DATE_CRITERION_PRESENTATION.created.label,
    );
  });

  it("rejects non-exact presentation identities without changing the default", () => {
    expect(timelineDateCriterionPresentation(" created ")).toBeNull();
    expect(timelineDateCriterionPresentation("updated")).toBeNull();
    expect(timelineDateCriterionPresentation(null)).toBeNull();
    expect(TIMELINE_DATE_CRITERION_DEFAULT).toBe("created");
  });

  it("keeps runtime capability requirements separate from presentation", () => {
    expect(TIMELINE_DATE_CRITERION_PRESENTATION.created).toMatchObject({
      id: "created",
      requiresServedSetting: false,
      unavailableReason: null,
    });
    expect(TIMELINE_DATE_CRITERION_PRESENTATION.modified).toMatchObject({
      id: "modified",
      requiresServedSetting: true,
      unavailableReason: {
        key: "timeline:disabledReasons.modifiedUnavailable",
      },
    });
    expect(TIMELINE_DATE_CRITERION_PRESENTATION.stamped).toMatchObject({
      id: "stamped",
      requiresServedSetting: true,
      unavailableReason: {
        key: "timeline:disabledReasons.stampedUnavailable",
      },
    });
    expect(timelineDateCriterionIsAvailable("created", false)).toBe(true);
    expect(timelineDateCriterionIsAvailable("modified", false)).toBe(false);
    expect(timelineDateCriterionIsAvailable("stamped", false)).toBe(false);
    expect(timelineDateCriterionIsAvailable("modified", true)).toBe(true);
    expect(timelineDateCriterionIsAvailable("stamped", true)).toBe(true);
    expect(timelineDateCriterionIsAvailable(" modified ", true)).toBe(false);
  });

  it("resolves complete English, French, and Arabic messages without fallback", () => {
    const english = createTestLocalizationRuntime();
    const french = createTestLocalizationRuntime(ltrTestLocale);
    const arabic = createTestLocalizationRuntime(rtlTestLocale);
    const messages = [
      [
        TIMELINE_DATE_CRITERION_PRESENTATION.created.label,
        "Created",
        "Création",
        "الإنشاء",
      ],
      [
        TIMELINE_DATE_CRITERION_PRESENTATION.modified.filterActionLabel,
        "Filter by edit date",
        "Filtrer par date de modification",
        "التصفية حسب تاريخ التعديل",
      ],
      [
        TIMELINE_DATE_CRITERION_PRESENTATION.created.currentFilterActionLabel,
        "Filter by creation date (current)",
        "Filtrer par date de création (actuelle)",
        "التصفية حسب تاريخ الإنشاء (الحالي)",
      ],
      [
        TIMELINE_DATE_CRITERION_PRESENTATION.stamped.rangeDescription,
        "Use the update date for the range",
        "Utiliser la date de mise à jour pour la période",
        "استخدام تاريخ التحديث للنطاق",
      ],
      [
        TIMELINE_DATE_CRITERION_MESSAGES.current,
        "Choose another date option to change the timeline.",
        "Choisissez une autre option de date pour modifier la chronologie.",
        "اختر خيار تاريخ آخر لتغيير المخطط الزمني.",
      ],
      [
        TIMELINE_DATE_CRITERION_MESSAGES.codeFiles,
        "Choose the edit date. Code files use edit dates.",
        "Choisissez la date de modification. Les fichiers de code utilisent les dates de modification.",
        "اختر تاريخ التعديل. تستخدم ملفات التعليمات البرمجية تواريخ التعديل.",
      ],
      [
        TIMELINE_DATE_CRITERION_MESSAGES.dateField,
        "Timeline date",
        "Date de la chronologie",
        "تاريخ المخطط الزمني",
      ],
    ] as const;

    for (const [descriptor, source, alternate, rtl] of messages) {
      expect(resolveMessageResult(english, descriptor)).toEqual({
        message: source,
        usedFallback: false,
      });
      expect(resolveMessageResult(french, descriptor)).toEqual({
        message: alternate,
        usedFallback: false,
      });
      expect(resolveMessageResult(arabic, descriptor)).toEqual({
        message: rtl,
        usedFallback: false,
      });
    }
  });
});
