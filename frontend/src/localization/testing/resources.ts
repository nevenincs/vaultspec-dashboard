import { en, sourceLocale } from "../../locales/en";

export const ltrTestLocale = "fr" as const;
export const rtlTestLocale = "ar" as const;

export const ltrTestResources = {
  common: {
    accessibility: {
      ...en.common.accessibility,
      recordShortcut: "Enregistrer un raccourci pour {{action}}",
      resetShortcut: "Réinitialiser le raccourci pour {{action}}",
    },
    actions: {
      ...en.common.actions,
      cancel: "Annuler",
      close: "Fermer",
      moveToNextPanel: "Passer au panneau suivant",
      moveToPreviousPanel: "Passer au panneau précédent",
      openCommandPalette: "Ouvrir la palette de commandes…",
      reloadPage: "Recharger la page",
      reset: "Réinitialiser",
      retry: "Réessayer",
      searchDocumentsAndCode: "Rechercher dans les documents et le code…",
      showKeyboardShortcuts: "Afficher les raccourcis clavier",
      showOrHideGraph: "Afficher ou masquer le graphe",
    },
    commandFamilies: {
      editing: "Modification",
      filters: "Filtres",
      focus: "Focus",
      general: "Général",
      help: "Aide",
      layout: "Disposition",
      navigation: "Navigation",
      refresh: "Actualisation",
      search: "Recherche",
      searchMaintenance: "Maintenance de la recherche",
      settings: "Paramètres",
      workspaceMaintenance: "Maintenance de l’espace de travail",
    },
    palette: {
      commandCount_many: "{{count, number}} commandes",
      commandCount_one: "{{count, number}} commande",
      commandCount_other: "{{count, number}} commandes",
    },
    disabledReasons: en.common.disabledReasons,
    feedback: {
      actionUnavailable:
        "Impossible de terminer l’action. Rechargez la page et réessayez.",
      copyFailed: "Impossible de copier. Réessayez.",
      copySucceeded: "Copié.",
    },
    destructiveActions: {
      discardChanges: "Ignorer les modifications",
    },
    shortcutDialog: {
      description: "Consultez les raccourcis clavier disponibles.",
      title: "Raccourcis clavier",
    },
    shortcutSettings: {
      conflict:
        "Ce raccourci est déjà attribué à {{action}}. Choisissez un autre raccourci.",
      empty: "Aucun raccourci clavier disponible",
      recording: "Appuyez sur une touche…",
    },
    shortcutGroups: {
      general: "Général",
      graph: "Graphe",
      navigation: "Navigation",
      window: "Fenêtre",
    },
    keycaps: {
      ...en.common.keycaps,
      arrowDown: "Flèche vers le bas",
      arrowLeft: "Flèche vers la gauche",
      arrowRight: "Flèche vers la droite",
      arrowUp: "Flèche vers le haut",
      backspace: "Retour arrière",
      delete: "Supprimer",
      escape: "Échap",
      pageDown: "Page suivante",
      pageUp: "Page précédente",
      shift: "Maj",
      space: "Espace",
    },
    statuses: en.common.statuses,
  },
  documents: {
    ...en.documents,
    accessibility: {
      switchReadingAndEditingShortcut:
        "Basculer entre la lecture et la modification ({{accelerator}})",
    },
    actions: {
      ...en.documents.actions,
      addToFeature: "Ajouter à une fonctionnalité…",
      clearFilter: "Effacer le filtre des documents",
      collapseTree: "Réduire l’arborescence des documents",
      expandTree: "Développer l’arborescence des documents",
      findByName: "Rechercher un document par nom…",
      finishEditing: "Terminer la modification",
      focusFilter: "Activer le filtre des documents",
      resetFilters: "Réinitialiser les filtres",
      save: "Enregistrer le document",
      showOrHideChanges: "Afficher ou masquer les modifications",
      showOrHideFilterOptions: "Afficher ou masquer les options de filtre",
      switchReadingAndEditing: "Basculer entre la lecture et la modification",
      switchView: "Basculer entre les documents et les fichiers",
    },
    disabledReasons: {
      ...en.documents.disabledReasons,
      copyChangesBeforeReopening:
        "Copiez vos modifications, puis rouvrez le document avant d’enregistrer.",
      openForEditing: "Ouvrez un document à modifier.",
      tryAfterSaving: "Réessayez une fois l’enregistrement terminé.",
      updateBeforeSaving: "Modifiez le document avant d’enregistrer.",
    },
    feedback: {
      alreadyLinked: "Ces documents sont déjà liés.",
      linkConflict:
        "Le document a été modifié avant de pouvoir être lié. Ouvrez-le, puis réessayez.",
      linkFailed: "Impossible de lier les documents. Réessayez.",
      linkInProgress: "Liaison des documents…",
      linkSucceeded: "Documents liés.",
    },
    shortcutGroups: {
      editing: "Modification du document",
    },
  },
  errors: {
    fallback: {
      contentUnavailable:
        "Ce contenu est indisponible. Rechargez la page et réessayez.",
    },
    unexpectedApplication: {
      message: "Rechargez la page et réessayez.",
      title: "Un problème est survenu",
    },
    unexpectedSection: {
      message: "Réessayez {{section}}.",
      title: "Cette section ne peut pas être affichée",
    },
  },
  features: {
    ...en.features,
    feedback: {
      archiveRejected:
        "La fonctionnalité n’a pas été archivée. Vérifiez-la, puis réessayez.",
      archiveSucceeded: "Fonctionnalité archivée.",
      archiveUnavailable: "Impossible d’archiver la fonctionnalité. Réessayez.",
      repairRejected:
        "La fonctionnalité n’a pas été réparée. Vérifiez-la, puis réessayez.",
      repairSucceeded: "Fonctionnalité réparée.",
      repairUnavailable: "Impossible de réparer la fonctionnalité. Réessayez.",
    },
  },
  graph: {
    actions: {
      clearSelection: "Effacer la sélection du graphe",
      expandFocusedItem: "Développer l’élément actif dans l’espace de travail",
      moveToNextConnectedItem: "Passer à l’élément connecté suivant",
      moveToPreviousConnectedItem: "Passer à l’élément connecté précédent",
      openFocusedItem: "Ouvrir l’élément actif",
    },
  },
  operations: {
    actions: {
      applySearchSettings: "Appliquer les paramètres de recherche",
      checkWorkspace: "Vérifier l’espace de travail",
      disableSearch: "Désactiver la recherche",
      enableSearch: "Activer la recherche",
      refreshSearch: "Actualiser la recherche",
      showWorkspaceDetails: "Afficher les détails de l’espace de travail",
    },
    feedback: {
      applySearchSettings: {
        failed: "Impossible d’appliquer les paramètres de recherche. Réessayez.",
        running: "Application des paramètres de recherche…",
        succeeded: "Paramètres de recherche appliqués.",
        unavailable: "La recherche est indisponible. Activez-la, puis réessayez.",
      },
      checkWorkspace: {
        failed: "Impossible de vérifier l’espace de travail. Réessayez.",
        running: "Vérification de l’espace de travail…",
        succeeded: "Vérification de l’espace de travail terminée.",
      },
      disableSearch: {
        failed: "Impossible de désactiver la recherche. Réessayez.",
        running: "Désactivation de la recherche…",
        succeeded: "Recherche désactivée.",
      },
      enableSearch: {
        failed: "Impossible d’activer la recherche. Réessayez.",
        running: "Activation de la recherche…",
        succeeded: "Recherche activée.",
        unavailable: "La recherche reste indisponible. Réessayez.",
      },
      refreshSearch: {
        failed: "Impossible d’actualiser la recherche. Réessayez.",
        running: "Actualisation de la recherche…",
        succeeded: "Actualisation de la recherche lancée.",
        unavailable: "La recherche est indisponible. Activez-la, puis réessayez.",
      },
      showWorkspaceDetails: {
        failed: "Impossible de charger les détails de l’espace de travail. Réessayez.",
        running: "Chargement des détails de l’espace de travail…",
        succeeded: "Détails de l’espace de travail chargés.",
      },
    },
  },
  projects: en.projects,
} as const;

export const rtlTestResources = {
  common: {
    accessibility: {
      ...en.common.accessibility,
      recordShortcut: "تسجيل اختصار لـ {{action}}",
      resetShortcut: "إعادة تعيين اختصار {{action}}",
    },
    actions: {
      ...en.common.actions,
      cancel: "إلغاء",
      close: "إغلاق",
      moveToNextPanel: "الانتقال إلى اللوحة التالية",
      moveToPreviousPanel: "الانتقال إلى اللوحة السابقة",
      openCommandPalette: "فتح لوحة الأوامر…",
      reloadPage: "إعادة تحميل الصفحة",
      reset: "إعادة تعيين",
      retry: "إعادة المحاولة",
      searchDocumentsAndCode: "البحث في المستندات والتعليمات البرمجية…",
      showOrHideGraph: "إظهار الرسم البياني أو إخفاؤه",
    },
    commandFamilies: {
      editing: "التحرير",
      filters: "عوامل التصفية",
      focus: "التركيز",
      general: "عام",
      help: "المساعدة",
      layout: "التخطيط",
      navigation: "التنقل",
      refresh: "التحديث",
      search: "البحث",
      searchMaintenance: "صيانة البحث",
      settings: "الإعدادات",
      workspaceMaintenance: "صيانة مساحة العمل",
    },
    palette: {
      commandCount_few: "{{count, number}} أوامر",
      commandCount_many: "{{count, number}} أمرًا",
      commandCount_one: "{{count, number}} أمر",
      commandCount_other: "{{count, number}} أمر",
      commandCount_two: "{{count, number}} أمران",
      commandCount_zero: "{{count, number}} أمر",
    },
    disabledReasons: en.common.disabledReasons,
    feedback: {
      actionUnavailable: "تعذر إكمال الإجراء. أعد تحميل الصفحة وحاول مرة أخرى.",
      copyFailed: "تعذر النسخ. حاول مرة أخرى.",
      copySucceeded: "تم النسخ.",
    },
    destructiveActions: {
      discardChanges: "تجاهل التغييرات",
    },
    shortcutDialog: en.common.shortcutDialog,
    shortcutSettings: {
      conflict: "هذا الاختصار مخصص بالفعل لـ {{action}}. اختر اختصارًا آخر.",
      empty: "لا توجد اختصارات لوحة مفاتيح متاحة",
      recording: "اضغط على مفتاح…",
    },
    shortcutGroups: {
      general: "عام",
      graph: "الرسم البياني",
      navigation: "التنقل",
      window: "النافذة",
    },
    keycaps: {
      ...en.common.keycaps,
      arrowDown: "سهم للأسفل",
      arrowLeft: "سهم لليسار",
      arrowRight: "سهم لليمين",
      arrowUp: "سهم للأعلى",
      backspace: "مسح للخلف",
      delete: "حذف",
      enter: "إدخال",
      escape: "خروج",
      shift: "تبديل",
      space: "مسافة",
    },
    statuses: en.common.statuses,
  },
  documents: {
    ...en.documents,
    accessibility: {
      switchReadingAndEditingShortcut: "التبديل بين القراءة والتحرير ({{accelerator}})",
    },
    actions: {
      ...en.documents.actions,
      finishEditing: "إنهاء التحرير",
      findByName: "البحث عن مستند بالاسم…",
      save: "حفظ المستند",
      showOrHideChanges: "إظهار التغييرات أو إخفاؤها",
      switchReadingAndEditing: "التبديل بين القراءة والتحرير",
    },
    disabledReasons: {
      ...en.documents.disabledReasons,
      copyChangesBeforeReopening: "انسخ تغييراتك، ثم أعد فتح المستند قبل الحفظ.",
      openForEditing: "افتح مستندًا لتحريره.",
      tryAfterSaving: "حاول مرة أخرى بعد اكتمال الحفظ.",
      updateBeforeSaving: "حدّث المستند قبل الحفظ.",
    },
    feedback: {
      alreadyLinked: "هذه المستندات مرتبطة بالفعل.",
      linkConflict: "تغير المستند قبل ربطه. افتحه، ثم حاول مرة أخرى.",
      linkFailed: "تعذر ربط المستندات. حاول مرة أخرى.",
      linkInProgress: "جارٍ ربط المستندات…",
      linkSucceeded: "تم ربط المستندات.",
    },
    shortcutGroups: {
      editing: "تحرير المستند",
    },
  },
  errors: {
    fallback: {
      contentUnavailable: "هذا المحتوى غير متاح. أعد تحميل الصفحة وحاول مرة أخرى.",
    },
    unexpectedApplication: {
      message: "أعد تحميل الصفحة وحاول مرة أخرى.",
      title: "حدث خطأ ما",
    },
    unexpectedSection: {
      message: "حاول فتح {{section}} مرة أخرى.",
      title: "تعذر عرض هذا القسم",
    },
  },
  features: {
    ...en.features,
    feedback: {
      archiveRejected: "لم تتم أرشفة الميزة. تحقق منها، ثم حاول مرة أخرى.",
      archiveSucceeded: "تمت أرشفة الميزة.",
      archiveUnavailable: "تعذرت أرشفة الميزة. حاول مرة أخرى.",
      repairRejected: "لم يتم إصلاح الميزة. تحقق منها، ثم حاول مرة أخرى.",
      repairSucceeded: "تم إصلاح الميزة.",
      repairUnavailable: "تعذر إصلاح الميزة. حاول مرة أخرى.",
    },
  },
  graph: {
    actions: {
      clearSelection: "مسح تحديد الرسم البياني",
      expandFocusedItem: "توسيع العنصر المحدد ضمن مساحة العمل",
      moveToNextConnectedItem: "الانتقال إلى العنصر المتصل التالي",
      moveToPreviousConnectedItem: "الانتقال إلى العنصر المتصل السابق",
      openFocusedItem: "فتح العنصر المحدد",
    },
  },
  operations: {
    actions: {
      applySearchSettings: "تطبيق إعدادات البحث",
      checkWorkspace: "فحص مساحة العمل",
      disableSearch: "تعطيل البحث",
      enableSearch: "تمكين البحث",
      refreshSearch: "تحديث البحث",
      showWorkspaceDetails: "عرض تفاصيل مساحة العمل",
    },
    feedback: {
      applySearchSettings: {
        failed: "تعذر تطبيق إعدادات البحث. حاول مرة أخرى.",
        running: "جارٍ تطبيق إعدادات البحث…",
        succeeded: "تم تطبيق إعدادات البحث.",
        unavailable: "البحث غير متاح. مكّن البحث، ثم حاول مرة أخرى.",
      },
      checkWorkspace: {
        failed: "تعذر فحص مساحة العمل. حاول مرة أخرى.",
        running: "جارٍ فحص مساحة العمل…",
        succeeded: "اكتمل فحص مساحة العمل.",
      },
      disableSearch: {
        failed: "تعذر تعطيل البحث. حاول مرة أخرى.",
        running: "جارٍ تعطيل البحث…",
        succeeded: "تم تعطيل البحث.",
      },
      enableSearch: {
        failed: "تعذر تمكين البحث. حاول مرة أخرى.",
        running: "جارٍ تمكين البحث…",
        succeeded: "تم تمكين البحث.",
        unavailable: "لا يزال البحث غير متاح. حاول مرة أخرى.",
      },
      refreshSearch: {
        failed: "تعذر تحديث البحث. حاول مرة أخرى.",
        running: "جارٍ تحديث البحث…",
        succeeded: "بدأ تحديث البحث.",
        unavailable: "البحث غير متاح. مكّن البحث، ثم حاول مرة أخرى.",
      },
      showWorkspaceDetails: {
        failed: "تعذر تحميل تفاصيل مساحة العمل. حاول مرة أخرى.",
        running: "جارٍ تحميل تفاصيل مساحة العمل…",
        succeeded: "تم تحميل تفاصيل مساحة العمل.",
      },
    },
  },
  projects: en.projects,
} as const;

export const testResources = {
  [sourceLocale]: en,
  [ltrTestLocale]: ltrTestResources,
  [rtlTestLocale]: rtlTestResources,
} as const;

export type TestLocale = keyof typeof testResources;
