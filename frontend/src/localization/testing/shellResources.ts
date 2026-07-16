import { en } from "../../locales/en";

export const ltrCS = {
  finalWave: {
    ...en.common.finalWave,
    history: {
      collapseMessage: "Réduire le message de {{commit}}",
      commit: "Validation",
      expandMessage: "Développer le message de {{commit}}",
      openCommit: "Ouvrir {{commit}}",
    },
    onboarding: {
      action: "Ajouter votre premier projet",
      ["body"]:
        "Aucun projet n’est encore connecté. Ajoutez un dossier de projet pour commencer. Le chemin est enregistré en lecture seule, donc rien n’est créé ni modifié sur le disque.",
      ["title"]: "Bienvenue dans vaultspec",
    },
    planSteps: {
      generic: "Étape du plan",
      genericRecordUnavailable: "Aucun enregistrement pour cette étape du plan",
      named: "{{step}}",
      openGenericRecord: "Ouvrir l’enregistrement de cette étape du plan",
      openRecord: "Ouvrir l’enregistrement de {{step}}",
      recordUnavailable: "Aucun enregistrement pour {{step}}",
    },
    work: {
      progress_one: "{{done, number}} étape sur {{count, number}} terminée",
      progress_many: "{{done, number}} étapes sur {{count, number}} terminées",
      progress_other: "{{done, number}} étapes sur {{count, number}} terminées",
    },
  },
  actions: {
    closeIsland: "Fermer l’îlot",
    focusOnStage: "Centrer sur la scène",
    goToDestinationNode: "Aller au nœud de destination",
    highlightOnStage: "Surligner sur la scène",
    removeFromRegistry: "Retirer du registre",
  },
  accessibility: {
    ...en.common.accessibility,
    actionsForItem: "Actions pour {{item}}",
    back: "Retour",
    breadcrumb: "Fil d’Ariane",
    recordShortcut: "Enregistrer un raccourci pour {{action}}",
    resizeActivityPanel: "Redimensionner le panneau d’activité",
    resizeNavigationPanel: "Redimensionner le panneau de navigation",
    resizeTimeline: "Redimensionner la chronologie",
    resetShortcut: "Réinitialiser le raccourci pour {{action}}",
    skipToContent: "Aller au contenu",
    switchWorkspace: "Changer d’espace de travail depuis {{workspace}}",
  },
  kit: {
    activity: {
      loading: "Chargement des données",
      rowsLoaded_one: "{{count, number}} ligne chargée…",
      rowsLoaded_many: "{{count, number}} lignes chargées…",
      rowsLoaded_other: "{{count, number}} lignes chargées…",
    },
    stepStates: { complete: "Terminée", open: "Ouverte" },
  },
  shell: {
    accessibility: {
      collapsedNavigation: "Navigation réduite",
      primaryNavigation: "Navigation principale",
    },
    navigation: {
      browse: "Parcourir",
      home: "Accueil",
      search: "Rechercher",
      status: "État",
    },
    regions: {
      activity: "Activité",
      fileBrowser: "Navigateur de fichiers",
      timeline: "Chronologie",
      workspace: "Graphe et documents",
    },
    workspace: {
      emptyMessage:
        "Affichez le graphe, créez un document ou ouvrez-en un depuis la navigation.",
      emptyTitle: "Aucun contenu ouvert",
    },
  },
  rail: {
    accessibility: {
      featureSuggestions: "Suggestions de fonctionnalités",
      scopeNavigation: "Navigation de portée",
    },
    filters: {
      advanced: "Filtres avancés",
      advancedApplied: "Filtres avancés ({{count, number}} appliqués)",
      featureAria: "Filtrer le coffre par fonctionnalité",
      featurePlaceholder: "Filtrer par fonctionnalité…",
    },
    states: {
      degradedMessage:
        "La recherche sémantique est hors ligne. Les éléments ouverts et l’historique peuvent être incomplets.",
      degradedTitle: "Fonctionnement dégradé",
      emptyMessage:
        "Aucun plan, demande de fusion ou problème ouvert dans cet espace de travail.",
      emptyTitle: "Rien en cours",
      loadingActivity: "Chargement de l’activité",
    },
  },
  disabledReasons: {
    launchProjectCannotBeRemoved: "Le projet de lancement ne peut pas être retiré",
    noDestination: "Aucune destination",
    noDestinationNode: "Aucun nœud de destination",
    noProjectPath: "Aucun chemin de projet",
    noRelation: "Aucune relation",
    viewingHistory: "Indisponible pendant la consultation de l’historique",
  },
} as const;

export const rtlCS = {
  finalWave: {
    ...en.common.finalWave,
    history: {
      collapseMessage: "طي رسالة {{commit}}",
      commit: "التزام",
      expandMessage: "توسيع رسالة {{commit}}",
      openCommit: "فتح {{commit}}",
    },
    onboarding: {
      action: "إضافة مشروعك الأول",
      ["body"]:
        "لا يوجد مشروع متصل بعد. أضف مجلد مشروع للبدء. يُسجل المسار للقراءة فقط، لذلك لن يُنشأ أو يُعدل شيء على القرص.",
      ["title"]: "مرحبًا بك في vaultspec",
    },
    planSteps: {
      generic: "خطوة في الخطة",
      genericRecordUnavailable: "لا يوجد سجل لهذه الخطوة في الخطة",
      named: "{{step}}",
      openGenericRecord: "فتح سجل هذه الخطوة في الخطة",
      openRecord: "فتح سجل {{step}}",
      recordUnavailable: "لا يوجد سجل لـ {{step}}",
    },
    work: {
      progress_zero: "اكتملت {{done, number}} من {{count, number}} خطوة",
      progress_one: "اكتملت {{done, number}} من {{count, number}} خطوة",
      progress_two: "اكتملت {{done, number}} من {{count, number}} خطوتين",
      progress_few: "اكتملت {{done, number}} من {{count, number}} خطوات",
      progress_many: "اكتملت {{done, number}} من {{count, number}} خطوة",
      progress_other: "اكتملت {{done, number}} من {{count, number}} خطوة",
    },
  },
  actions: {
    closeIsland: "إغلاق الجزيرة",
    focusOnStage: "التركيز على المسرح",
    goToDestinationNode: "الانتقال إلى عقدة الوجهة",
    highlightOnStage: "تمييز على المسرح",
    removeFromRegistry: "إزالة من السجل",
  },
  accessibility: {
    ...en.common.accessibility,
    actionsForItem: "إجراءات {{item}}",
    back: "رجوع",
    breadcrumb: "مسار التنقل",
    recordShortcut: "سجّل اختصارًا للإجراء {{action}}",
    resizeActivityPanel: "غيّر حجم لوحة النشاط",
    resizeNavigationPanel: "غيّر حجم لوحة التنقل",
    resizeTimeline: "غيّر حجم المخطط الزمني",
    resetShortcut: "أعد تعيين اختصار الإجراء {{action}}",
    skipToContent: "التخطي إلى المحتوى",
    switchWorkspace: "تبديل مساحة العمل من {{workspace}}",
  },
  kit: {
    activity: {
      loading: "جارٍ تحميل البيانات",
      rowsLoaded_zero: "تم تحميل {{count, number}} صف",
      rowsLoaded_one: "تم تحميل {{count, number}} صف واحد",
      rowsLoaded_two: "تم تحميل {{count, number}} صفين",
      rowsLoaded_few: "تم تحميل {{count, number}} صفوف",
      rowsLoaded_many: "تم تحميل {{count, number}} صفًا",
      rowsLoaded_other: "تم تحميل {{count, number}} صف",
    },
    stepStates: { complete: "مكتملة", open: "مفتوحة" },
  },
  shell: {
    accessibility: {
      collapsedNavigation: "التنقل المصغّر",
      primaryNavigation: "التنقل الرئيسي",
    },
    navigation: {
      browse: "تصفح",
      home: "الرئيسية",
      search: "بحث",
      status: "الحالة",
    },
    regions: {
      activity: "النشاط",
      fileBrowser: "متصفح الملفات",
      timeline: "المخطط الزمني",
      workspace: "الرسم البياني والمستندات",
    },
    workspace: {
      emptyMessage: "أظهر الرسم البياني أو أنشئ مستندًا أو افتح مستندًا من التنقل.",
      emptyTitle: "لا يوجد محتوى مفتوح",
    },
  },
  rail: {
    accessibility: {
      featureSuggestions: "اقتراحات الميزات",
      scopeNavigation: "تنقل النطاق",
    },
    filters: {
      advanced: "عوامل تصفية متقدمة",
      advancedApplied: "عوامل تصفية متقدمة ({{count, number}} مطبقة)",
      featureAria: "تصفية الخزنة حسب الميزة",
      featurePlaceholder: "تصفية حسب الميزة…",
    },
    states: {
      degradedMessage:
        "البحث الدلالي غير متصل. قد تكون العناصر المفتوحة والسجل غير مكتملين.",
      degradedTitle: "تشغيل متدهور",
      emptyMessage: "لا توجد خطط أو طلبات دمج أو مشكلات مفتوحة في مساحة العمل.",
      emptyTitle: "لا شيء قيد التنفيذ",
      loadingActivity: "جارٍ تحميل النشاط",
    },
  },
  disabledReasons: {
    launchProjectCannotBeRemoved: "لا يمكن إزالة مشروع التشغيل",
    noDestination: "لا توجد وجهة",
    noDestinationNode: "لا توجد عقدة وجهة",
    noProjectPath: "لا يوجد مسار للمشروع",
    noRelation: "لا توجد علاقة",
    viewingHistory: "غير متاح أثناء عرض السجل",
  },
} as const;

export const ltrDS = {
  workspace: {
    accessibility: {
      codeViewer: "Afficheur de code",
      documentViewer: "Afficheur de document",
      inWorkspace: "Dans l’espace de travail {{workspace}}",
    },
  },
} as const;

export const rtlDS = {
  workspace: {
    accessibility: {
      codeViewer: "عارض الشفرة",
      documentViewer: "عارض المستند",
      inWorkspace: "في مساحة العمل {{workspace}}",
    },
  },
} as const;
