import { en } from "../../locales/en";

export const ltrVW = {
  ...en.documents.localizationWave,
  plan: {
    completion_one: "Avancement du plan, {{done, number}} sur {{count, number}} étape",
    completion_many:
      "Avancement du plan, {{done, number}} sur {{count, number}} étapes",
    completion_other:
      "Avancement du plan, {{done, number}} sur {{count, number}} étapes",
    counts: "{{waves}} · {{phases}} · {{steps}}",
    loadingSummary: "Chargement du résumé du plan…",
    phaseCount_one: "{{count, number}} phase",
    phaseCount_many: "{{count, number}} phases",
    phaseCount_other: "{{count, number}} phases",
    stepCount_one: "{{count, number}} étape",
    stepCount_many: "{{count, number}} étapes",
    stepCount_other: "{{count, number}} étapes",
    waveCount_one: "{{count, number}} vague",
    waveCount_many: "{{count, number}} vagues",
    waveCount_other: "{{count, number}} vagues",
  },
} as const;

export const rtlVW = {
  ...en.documents.localizationWave,
  plan: {
    completion_zero: "اكتمال الخطة، {{done, number}} من {{count, number}} خطوة",
    completion_one: "اكتمال الخطة، {{done, number}} من {{count, number}} خطوة",
    completion_two: "اكتمال الخطة، {{done, number}} من {{count, number}} خطوتين",
    completion_few: "اكتمال الخطة، {{done, number}} من {{count, number}} خطوات",
    completion_many: "اكتمال الخطة، {{done, number}} من {{count, number}} خطوة",
    completion_other: "اكتمال الخطة، {{done, number}} من {{count, number}} خطوة",
    counts: "{{waves}} · {{phases}} · {{steps}}",
    loadingSummary: "جارٍ تحميل ملخص الخطة…",
    phaseCount_zero: "{{count, number}} مرحلة",
    phaseCount_one: "{{count, number}} مرحلة واحدة",
    phaseCount_two: "{{count, number}} مرحلتان",
    phaseCount_few: "{{count, number}} مراحل",
    phaseCount_many: "{{count, number}} مرحلة",
    phaseCount_other: "{{count, number}} مرحلة",
    stepCount_zero: "{{count, number}} خطوة",
    stepCount_one: "{{count, number}} خطوة واحدة",
    stepCount_two: "{{count, number}} خطوتان",
    stepCount_few: "{{count, number}} خطوات",
    stepCount_many: "{{count, number}} خطوة",
    stepCount_other: "{{count, number}} خطوة",
    waveCount_zero: "{{count, number}} موجة",
    waveCount_one: "{{count, number}} موجة واحدة",
    waveCount_two: "{{count, number}} موجتان",
    waveCount_few: "{{count, number}} موجات",
    waveCount_many: "{{count, number}} موجة",
    waveCount_other: "{{count, number}} موجة",
  },
} as const;
