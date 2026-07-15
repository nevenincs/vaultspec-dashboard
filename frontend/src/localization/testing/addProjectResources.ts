export const ltrAddProjectDialogResources = {
  accessibility: { folderPath: "Chemin du dossier du projet" },
  actions: {
    add: "Ajouter le projet",
    adding: "Ajout du projet…",
    pickFolder: "Choisir le dossier",
  },
  description: "Choisissez un dossier de projet. Ses fichiers ne seront pas modifiés.",
  errors: {
    addFailed: "Impossible d’ajouter ce projet. Réessayez.",
    alreadyAdded: "Ce projet est déjà ajouté. Choisissez-le dans la liste des projets.",
    folderUnavailable:
      "Impossible d’ouvrir ce dossier. Vérifiez le chemin et les autorisations du dossier, puis réessayez.",
    notGitProject: "Choisissez un dossier contenant un dépôt Git.",
    pathRequired: "Saisissez le chemin complet d’un dossier de projet.",
  },
  fields: { folder: "Dossier du projet" },
  placeholders: { folderPath: "Saisissez le chemin complet du dossier" },
  title: "Ajouter un projet",
} as const;

export const rtlAddProjectDialogResources = {
  accessibility: { folderPath: "مسار مجلد المشروع" },
  actions: {
    add: "إضافة المشروع",
    adding: "جارٍ إضافة المشروع…",
    pickFolder: "اختيار المجلد",
  },
  description: "اختر مجلد مشروع. لن يتم تعديل ملفاته.",
  errors: {
    addFailed: "تعذر إضافة هذا المشروع. حاول مرة أخرى.",
    alreadyAdded: "تمت إضافة هذا المشروع بالفعل. اختره من المشاريع.",
    folderUnavailable:
      "تعذر فتح هذا المجلد. تحقق من المسار وأذونات المجلد، ثم حاول مرة أخرى.",
    notGitProject: "اختر مجلدًا يحتوي على مستودع Git.",
    pathRequired: "أدخل المسار الكامل لمجلد المشروع.",
  },
  fields: { folder: "مجلد المشروع" },
  placeholders: { folderPath: "أدخل المسار الكامل للمجلد" },
  title: "إضافة مشروع",
} as const;
