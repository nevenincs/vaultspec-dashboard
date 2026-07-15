export const ltrSearchPaletteResources = {
  accessibility: {
    dialog: "Rechercher dans les documents et le code",
    results: "Résultats de recherche",
    scope: "Périmètre de recherche",
    selectableResult: "Ouvrir {{title}}",
    unavailableResult: "Impossible d’ouvrir {{title}}.",
  },
  actions: {
    cancel: "Annuler",
    close: "Fermer",
    move: "Déplacer",
    open: "Ouvrir",
    previousNext: "Précédent ou suivant",
  },
  counts: {
    results_many: "{{count, number}} résultats",
    results_one: "{{count, number}} résultat",
    results_other: "{{count, number}} résultats",
  },
  labels: {
    change: "Modification",
    code: "Code",
    document: "Document",
    result: "Résultat",
    untitledResult: "Résultat sans titre",
  },
  placeholders: { query: "Rechercher dans les documents et le code…" },
  preview: { unavailable: "Aperçu indisponible." },
  scopes: { all: "Tout", code: "Code", documents: "Documents" },
  states: {
    degraded:
      "Certaines options de recherche sont indisponibles. Les résultats disponibles sont affichés.",
    failed: "La recherche a échoué. Réessayez.",
    idle: "Recherchez dans vos documents et votre code.",
    incomplete:
      "Certains fichiers peuvent manquer. Affinez votre recherche et réessayez.",
    noMatches: "Aucun résultat pour « {{query}} ».",
    searching: "Recherche dans les documents et le code…",
  },
} as const;

export const rtlSearchPaletteResources = {
  accessibility: {
    dialog: "البحث في المستندات والتعليمات البرمجية",
    results: "نتائج البحث",
    scope: "نطاق البحث",
    selectableResult: "فتح {{title}}",
    unavailableResult: "لا يمكن فتح {{title}}.",
  },
  actions: {
    cancel: "إلغاء",
    close: "إغلاق",
    move: "تحريك",
    open: "فتح",
    previousNext: "السابق أو التالي",
  },
  counts: {
    results_few: "{{count, number}} نتائج",
    results_many: "{{count, number}} نتيجة",
    results_one: "{{count, number}} نتيجة",
    results_other: "{{count, number}} نتيجة",
    results_two: "{{count, number}} نتيجتان",
    results_zero: "{{count, number}} نتائج",
  },
  labels: {
    change: "تغيير",
    code: "تعليمات برمجية",
    document: "مستند",
    result: "نتيجة",
    untitledResult: "نتيجة بلا عنوان",
  },
  placeholders: { query: "البحث في المستندات والتعليمات البرمجية…" },
  preview: { unavailable: "المعاينة غير متاحة." },
  scopes: { all: "الكل", code: "التعليمات البرمجية", documents: "المستندات" },
  states: {
    degraded: "بعض خيارات البحث غير متاحة. تظهر النتائج المتاحة.",
    failed: "فشل البحث. حاول مرة أخرى.",
    idle: "ابحث في مستنداتك والتعليمات البرمجية.",
    incomplete: "قد تكون بعض الملفات مفقودة. حسّن البحث وحاول مرة أخرى.",
    noMatches: "لا توجد نتائج تطابق «{{query}}».",
    searching: "جارٍ البحث في المستندات والتعليمات البرمجية…",
  },
} as const;
