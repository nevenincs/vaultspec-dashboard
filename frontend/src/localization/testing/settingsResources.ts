export const ltrSettingsResources = {
  actions: {
    useDarkTheme: "Utiliser le thème sombre",
    useHighContrastTheme: "Utiliser le thème à contraste élevé",
    useLightTheme: "Utiliser le thème clair",
    useSystemTheme: "Utiliser le thème du système",
  },
  groups: {
    appearance: "Apparence",
    graph: "Graphe",
    keybindings: "Raccourcis clavier",
  },
  fields: {
    theme: { label: "Thème", description: "Choisissez le thème de l’interface." },
    reduceMotion: {
      label: "Réduire les animations",
      description: "Utilisez moins d’animations dans l’interface.",
    },
    activitySectionFolds: {
      label: "Sections d’activité",
      description: "Mémorisez les sections d’activité ouvertes.",
    },
    language: {
      label: "Langue",
      description: "Choisissez la langue de l’interface.",
    },
    defaultGranularity: {
      label: "Niveau de détail par défaut",
      description: "Choisissez le niveau de détail initial du graphe.",
    },
    corpus: {
      label: "Contenu du graphe",
      description: "Choisissez le contenu affiché dans le graphe.",
    },
    timelineDate: {
      label: "Date de la chronologie",
      description: "Choisissez la date qui contrôle la chronologie.",
    },
    confidenceFloor: {
      label: "Certitude minimale des connexions",
      description: "Masquez les connexions sous ce niveau de certitude.",
    },
    labelFilter: {
      label: "Filtre par nom",
      description: "Affichez les éléments dont le nom correspond.",
      placeholder: "Filtrer par nom",
    },
    graphControls: {
      label: "Commandes du graphe",
      description: "Personnalisez la navigation du graphe.",
    },
    shortcuts: {
      label: "Raccourcis clavier",
      description: "Personnalisez les commandes clavier.",
    },
  },
  options: {
    system: "Système",
    light: "Clair",
    dark: "Sombre",
    highContrast: "Contraste élevé",
    english: "Anglais",
  },
} as const;

export const rtlSettingsResources = {
  actions: {
    useDarkTheme: "استخدام النسق الداكن",
    useHighContrastTheme: "استخدام نسق عالي التباين",
    useLightTheme: "استخدام النسق الفاتح",
    useSystemTheme: "استخدام نسق النظام",
  },
  groups: {
    appearance: "المظهر",
    graph: "الرسم البياني",
    keybindings: "اختصارات لوحة المفاتيح",
  },
  fields: {
    theme: { label: "النسق", description: "اختر نسق الواجهة." },
    reduceMotion: {
      label: "تقليل الحركة",
      description: "استخدم رسومًا متحركة أقل في الواجهة.",
    },
    activitySectionFolds: {
      label: "أقسام النشاط",
      description: "تذكر أقسام النشاط المفتوحة.",
    },
    language: { label: "اللغة", description: "اختر لغة الواجهة." },
    defaultGranularity: {
      label: "التفصيل الافتراضي",
      description: "اختر مستوى التفاصيل الأولي للرسم البياني.",
    },
    corpus: { label: "محتوى الرسم", description: "اختر المحتوى الذي يظهر في الرسم." },
    timelineDate: {
      label: "تاريخ المخطط الزمني",
      description: "اختر التاريخ الذي يتحكم في المخطط.",
    },
    confidenceFloor: {
      label: "الحد الأدنى ليقين الاتصال",
      description: "أخفِ الاتصالات دون هذا اليقين.",
    },
    labelFilter: {
      label: "تصفية الاسم",
      description: "اعرض العناصر ذات الأسماء المطابقة.",
      placeholder: "تصفية حسب الاسم",
    },
    graphControls: { label: "عناصر تحكم الرسم", description: "خصص التنقل في الرسم." },
    shortcuts: {
      label: "اختصارات لوحة المفاتيح",
      description: "خصص أوامر لوحة المفاتيح.",
    },
  },
  options: {
    system: "النظام",
    light: "فاتح",
    dark: "داكن",
    highContrast: "تباين عالٍ",
    english: "الإنجليزية",
  },
} as const;
