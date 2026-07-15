// Test-locale resources for the workspace picker's browser pane and places
// rail (workspace-picker-dialog), split from resources.ts like
// addProjectResources.ts (module-size gate).

export const ltrFolderBrowserResources = {
  accessibility: {
    filterFolders: "Filtrer les dossiers de ce niveau",
    folderOptionGitRepository: "{{folder}}, dépôt Git",
    folderOptionHidden: "{{folder}}, dossier caché",
    folderOptionProject: "{{folder}}, projet",
    folderOptionRegistered: "{{folder}}, déjà ajouté",
    folders: "Dossiers",
    showHiddenFolders: "Afficher les dossiers cachés",
  },
  badges: {
    alreadyAdded: "Déjà ajouté",
    gitRepository: "Dépôt Git",
    hidden: "Caché",
    project: "Projet",
  },
  empty: {
    noMatches: "Aucun dossier ne correspond.",
    noSubfolders: "Aucun sous-dossier ici.",
  },
  errors: {
    readFailed: "Impossible d’ouvrir ce dossier.",
    readFailedHint: "Vérifiez le chemin ou choisissez un autre dossier.",
  },
  labels: {
    filterFolders: "Filtrer les dossiers…",
    hidden: "Cachés",
    roots: "Cet ordinateur",
  },
  states: {
    loading: "Lecture des dossiers…",
    truncated: "Affichage des {{limit, number}} premiers dossiers.",
  },
} as const;

export const ltrPlacesRailResources = {
  labels: {
    home: "Accueil",
    places: "Emplacements",
  },
  sections: {
    drives: "Lecteurs",
    projects: "Projets",
    recent: "Récents",
  },
} as const;

export const rtlFolderBrowserResources = {
  accessibility: {
    filterFolders: "تصفية مجلدات هذا المستوى",
    folderOptionGitRepository: "{{folder}}، مستودع Git",
    folderOptionHidden: "{{folder}}، مجلد مخفي",
    folderOptionProject: "{{folder}}، مشروع",
    folderOptionRegistered: "{{folder}}، مضاف بالفعل",
    folders: "المجلدات",
    showHiddenFolders: "إظهار المجلدات المخفية",
  },
  badges: {
    alreadyAdded: "مضاف بالفعل",
    gitRepository: "مستودع Git",
    hidden: "مخفي",
    project: "مشروع",
  },
  empty: {
    noMatches: "لا توجد مجلدات مطابقة.",
    noSubfolders: "لا توجد مجلدات فرعية هنا.",
  },
  errors: {
    readFailed: "تعذر فتح هذا المجلد.",
    readFailedHint: "تحقق من المسار أو اختر مجلدًا آخر.",
  },
  labels: {
    filterFolders: "تصفية المجلدات…",
    hidden: "المخفية",
    roots: "هذا الكمبيوتر",
  },
  states: {
    loading: "جارٍ قراءة المجلدات…",
    truncated: "يتم عرض أول {{limit, number}} مجلد.",
  },
} as const;

export const rtlPlacesRailResources = {
  labels: {
    home: "الرئيسية",
    places: "الأماكن",
  },
  sections: {
    drives: "محركات الأقراص",
    projects: "المشاريع",
    recent: "الأخيرة",
  },
} as const;
