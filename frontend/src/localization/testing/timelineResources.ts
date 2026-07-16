export const ltrTimelineResources = {
  accessibility: {
    dateField: "Date de la chronologie",
    loadingRange: "Chargement de la période",
    rangeEnd: "Fin de la période",
    rangeStart: "Début de la période",
    selectedRange: "Période sélectionnée",
  },
  actions: {
    clearDateRange: "Effacer la période",
    filterByCreationDate: "Filtrer par date de création",
    filterByCreationDateCurrent: "Filtrer par date de création (actuelle)",
    filterByEditDate: "Filtrer par date de modification",
    filterByEditDateCurrent: "Filtrer par date de modification (actuelle)",
    filterByUpdateDate: "Filtrer par date de mise à jour",
    filterByUpdateDateCurrent: "Filtrer par date de mise à jour (actuelle)",
    showLast24Hours: "Afficher les dernières 24 heures",
    showLast7Days: "Afficher les 7 derniers jours",
    showLast30Days: "Afficher les 30 derniers jours",
    showLast90Days: "Afficher les 90 derniers jours",
    viewProjectAtVersion: "Afficher le projet dans cette version",
    returnToLive: "Revenir au direct",
  },
  criteria: {
    created: "Création",
    modified: "Modification",
    stamped: "Mise à jour",
  },
  descriptions: {
    useCreationDateForRange: "Utiliser la date de création pour la période",
    useEditDateForRange: "Utiliser la date de modification pour la période",
    useUpdateDateForRange: "Utiliser la date de mise à jour pour la période",
  },
  disabledReasons: {
    codeFiles:
      "Choisissez la date de modification. Les fichiers de code utilisent les dates de modification.",
    chooseProject: "Choisissez un projet, puis réessayez.",
    current: "Choisissez une autre option de date pour modifier la chronologie.",
    modifiedUnavailable:
      "Choisissez la date de création. Les dates de modification ne sont pas disponibles ici.",
    refreshHistory: "Actualisez l’historique du projet, puis réessayez.",
    stampedUnavailable:
      "Choisissez la date de création. Les dates de mise à jour ne sont pas disponibles ici.",
    switchToDocumentsForHistory:
      "Passez aux documents pour afficher l’historique du projet.",
  },
  labels: {
    timeline: "Chronologie",
  },
  states: {
    noDatedDocuments: "Aucun document daté dans cette vue.",
    noDatedFiles: "Aucun fichier daté dans cette vue.",
    rangeUnavailable: "La période n’est pas disponible. Réessayez dans un instant.",
  },
  summaries: {
    selectedRange: "{{start}} au {{end}}",
    viewingAt: "Affichage de {{date}}",
  },
} as const;

export const rtlTimelineResources = {
  accessibility: {
    dateField: "تاريخ المخطط الزمني",
    loadingRange: "جارٍ تحميل نطاق التاريخ",
    rangeEnd: "نهاية نطاق التاريخ",
    rangeStart: "بداية نطاق التاريخ",
    selectedRange: "نطاق التاريخ المحدد",
  },
  actions: {
    clearDateRange: "مسح نطاق التاريخ",
    filterByCreationDate: "التصفية حسب تاريخ الإنشاء",
    filterByCreationDateCurrent: "التصفية حسب تاريخ الإنشاء (الحالي)",
    filterByEditDate: "التصفية حسب تاريخ التعديل",
    filterByEditDateCurrent: "التصفية حسب تاريخ التعديل (الحالي)",
    filterByUpdateDate: "التصفية حسب تاريخ التحديث",
    filterByUpdateDateCurrent: "التصفية حسب تاريخ التحديث (الحالي)",
    showLast24Hours: "عرض آخر 24 ساعة",
    showLast7Days: "عرض آخر 7 أيام",
    showLast30Days: "عرض آخر 30 يومًا",
    showLast90Days: "عرض آخر 90 يومًا",
    viewProjectAtVersion: "عرض المشروع بهذا الإصدار",
    returnToLive: "العودة إلى العرض المباشر",
  },
  criteria: {
    created: "الإنشاء",
    modified: "التعديل",
    stamped: "التحديث",
  },
  descriptions: {
    useCreationDateForRange: "استخدام تاريخ الإنشاء للنطاق",
    useEditDateForRange: "استخدام تاريخ التعديل للنطاق",
    useUpdateDateForRange: "استخدام تاريخ التحديث للنطاق",
  },
  disabledReasons: {
    codeFiles: "اختر تاريخ التعديل. تستخدم ملفات التعليمات البرمجية تواريخ التعديل.",
    chooseProject: "اختر مشروعًا، ثم حاول مرة أخرى.",
    current: "اختر خيار تاريخ آخر لتغيير المخطط الزمني.",
    modifiedUnavailable: "اختر تاريخ الإنشاء. تواريخ التعديل غير متاحة هنا.",
    refreshHistory: "حدّث سجل المشروع، ثم حاول مرة أخرى.",
    stampedUnavailable: "اختر تاريخ الإنشاء. تواريخ التحديث غير متاحة هنا.",
    switchToDocumentsForHistory: "انتقل إلى المستندات لعرض سجل المشروع.",
  },
  labels: {
    timeline: "المخطط الزمني",
  },
  states: {
    noDatedDocuments: "لا توجد مستندات مؤرخة في هذا العرض.",
    noDatedFiles: "لا توجد ملفات مؤرخة في هذا العرض.",
    rangeUnavailable: "نطاق التاريخ غير متاح. حاول مرة أخرى بعد قليل.",
  },
  summaries: {
    selectedRange: "{{start}} إلى {{end}}",
    viewingAt: "عرض {{date}}",
  },
} as const;
