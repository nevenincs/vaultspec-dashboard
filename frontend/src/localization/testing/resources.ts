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
    disabledReasons: en.common.disabledReasons,
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
  features: en.features,
  graph: {
    actions: {
      clearSelection: "Effacer la sélection du graphe",
      expandFocusedItem: "Développer l’élément actif dans l’espace de travail",
      moveToNextConnectedItem: "Passer à l’élément connecté suivant",
      moveToPreviousConnectedItem: "Passer à l’élément connecté précédent",
      openFocusedItem: "Ouvrir l’élément actif",
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
    disabledReasons: en.common.disabledReasons,
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
  features: en.features,
  graph: {
    actions: {
      clearSelection: "مسح تحديد الرسم البياني",
      expandFocusedItem: "توسيع العنصر المحدد ضمن مساحة العمل",
      moveToNextConnectedItem: "الانتقال إلى العنصر المتصل التالي",
      moveToPreviousConnectedItem: "الانتقال إلى العنصر المتصل السابق",
      openFocusedItem: "فتح العنصر المحدد",
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
