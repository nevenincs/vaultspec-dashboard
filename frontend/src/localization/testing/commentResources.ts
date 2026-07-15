const title = "title" as const;
const body = "body" as const;

export const ltrCommentResources = {
  accessibility: {
    commentsToReview: "Commentaires à examiner",
    editComment: "Modifier le commentaire",
    newComment: "Nouveau commentaire",
    sectionComments: "Commentaires de la section",
  },
  actions: {
    add: "Ajouter un commentaire",
    close: "Fermer les commentaires",
    copyLink: "Copier le lien",
    edit: "Modifier le commentaire",
    open: "Ouvrir les commentaires",
    reopen: "Rouvrir le commentaire",
    resolve: "Résoudre le commentaire",
    save: "Enregistrer le commentaire",
    tryAgain: "Réessayer",
  },
  authorKinds: {
    agent: "Assistant",
    human: "Vous",
    system: "Système",
    toolExecutor: "Automatisation",
    unknown: "Auteur inconnu",
  },
  confirmations: {
    delete: {
      [title]: "Supprimer ce commentaire ?",
      [body]: "Supprimez définitivement ce commentaire. Cette action est irréversible.",
    },
  },
  connectionIssues: {
    ambiguous:
      "Plusieurs sections correspondent à ce commentaire. Renommez un titre, puis déplacez le commentaire.",
    changed: "Cette section a changé. Déplacez le commentaire vers cette section.",
    malformed:
      "La section de ce commentaire est introuvable. Déplacez le commentaire vers une autre section.",
    missing:
      "Cette section n’est plus disponible. Déplacez le commentaire vers une autre section.",
  },
  counts: {
    commentsToReview_one: "{{count, number}} commentaire à examiner",
    commentsToReview_many: "{{count, number}} commentaires à examiner",
    commentsToReview_other: "{{count, number}} commentaires à examiner",
    days_one: "Il y a {{count, number}} jour",
    days_many: "Il y a {{count, number}} jours",
    days_other: "Il y a {{count, number}} jours",
    hours_one: "Il y a {{count, number}} heure",
    hours_many: "Il y a {{count, number}} heures",
    hours_other: "Il y a {{count, number}} heures",
    minutes_one: "Il y a {{count, number}} minute",
    minutes_many: "Il y a {{count, number}} minutes",
    minutes_other: "Il y a {{count, number}} minutes",
    months_one: "Il y a {{count, number}} mois",
    months_many: "Il y a {{count, number}} mois",
    months_other: "Il y a {{count, number}} mois",
    years_one: "Il y a {{count, number}} an",
    years_many: "Il y a {{count, number}} ans",
    years_other: "Il y a {{count, number}} ans",
  },
  descriptions: {
    attachedToSection: "Les commentaires restent associés à cette section.",
  },
  disabledReasons: {
    actorPreparing: "Attendez que les commentaires soient prêts.",
    duplicateHeading:
      "Renommez un titre correspondant, puis ajoutez votre commentaire.",
  },
  emptyStates: {
    noComments: "Aucun commentaire dans cette section pour le moment.",
    noCommentsToReview: "Aucun commentaire à examiner.",
  },
  errors: {
    actorUnavailable:
      "Les commentaires sont indisponibles. Fermez-les, puis réessayez.",
    addFailed: "Le commentaire n’a pas pu être ajouté. Réessayez.",
    copyLinkFailed: "Le lien n’a pas pu être copié. Réessayez.",
    deleteFailed: "Le commentaire n’a pas pu être supprimé. Réessayez.",
    loadFailed: "Les commentaires n’ont pas pu être chargés. Réessayez.",
    moveFailed: "Le commentaire n’a pas pu être déplacé. Réessayez.",
    reopenFailed: "Le commentaire n’a pas pu être rouvert. Réessayez.",
    resolveFailed: "Le commentaire n’a pas pu être résolu. Réessayez.",
    saveFailed: "Le commentaire n’a pas pu être enregistré. Réessayez.",
  },
  feedback: {
    added: "Commentaire ajouté.",
    deleted: "Commentaire supprimé.",
    moved: "Commentaire déplacé.",
    reopened: "Commentaire rouvert.",
    resolved: "Commentaire résolu.",
    saved: "Commentaire enregistré.",
  },
  placeholders: {
    newComment: "Ajouter un commentaire…",
  },
  states: {
    justNow: "À l’instant",
    loading: "Chargement des commentaires…",
    preparing: "Préparation des commentaires…",
    resolved: "Résolu",
  },
} as const;

export const ltrCommentGuardedActions = {
  moveCommentToThisSection: "Déplacer le commentaire vers cette section",
} as const;

export const ltrCommentDestructiveActions = {
  deleteComment: "Supprimer le commentaire",
} as const;

export const rtlCommentResources = {
  accessibility: {
    commentsToReview: "تعليقات للمراجعة",
    editComment: "تحرير التعليق",
    newComment: "تعليق جديد",
    sectionComments: "تعليقات القسم",
  },
  actions: {
    add: "إضافة تعليق",
    close: "إغلاق التعليقات",
    copyLink: "نسخ الرابط",
    edit: "تحرير التعليق",
    open: "فتح التعليقات",
    reopen: "إعادة فتح التعليق",
    resolve: "حل التعليق",
    save: "حفظ التعليق",
    tryAgain: "المحاولة مرة أخرى",
  },
  authorKinds: {
    agent: "المساعد",
    human: "أنت",
    system: "النظام",
    toolExecutor: "الأتمتة",
    unknown: "مؤلف غير معروف",
  },
  confirmations: {
    delete: {
      [title]: "هل تريد حذف هذا التعليق؟",
      [body]: "احذف هذا التعليق نهائيًا. لا يمكن التراجع عن هذا الإجراء.",
    },
  },
  connectionIssues: {
    ambiguous: "يتطابق أكثر من قسم مع هذا التعليق. أعد تسمية عنوان، ثم انقل التعليق.",
    changed: "تغيّر هذا القسم. انقل التعليق إلى هذا القسم.",
    malformed: "تعذر العثور على قسم هذا التعليق. انقل التعليق إلى قسم آخر.",
    missing: "لم يعد هذا القسم متاحًا. انقل التعليق إلى قسم آخر.",
  },
  counts: {
    commentsToReview_zero: "{{count, number}} تعليق للمراجعة",
    commentsToReview_one: "{{count, number}} تعليق للمراجعة",
    commentsToReview_two: "{{count, number}} تعليقان للمراجعة",
    commentsToReview_few: "{{count, number}} تعليقات للمراجعة",
    commentsToReview_many: "{{count, number}} تعليقًا للمراجعة",
    commentsToReview_other: "{{count, number}} تعليق للمراجعة",
    days_zero: "منذ {{count, number}} يوم",
    days_one: "منذ {{count, number}} يوم",
    days_two: "منذ {{count, number}} يومين",
    days_few: "منذ {{count, number}} أيام",
    days_many: "منذ {{count, number}} يومًا",
    days_other: "منذ {{count, number}} يوم",
    hours_zero: "منذ {{count, number}} ساعة",
    hours_one: "منذ {{count, number}} ساعة",
    hours_two: "منذ {{count, number}} ساعتين",
    hours_few: "منذ {{count, number}} ساعات",
    hours_many: "منذ {{count, number}} ساعة",
    hours_other: "منذ {{count, number}} ساعة",
    minutes_zero: "منذ {{count, number}} دقيقة",
    minutes_one: "منذ {{count, number}} دقيقة",
    minutes_two: "منذ {{count, number}} دقيقتين",
    minutes_few: "منذ {{count, number}} دقائق",
    minutes_many: "منذ {{count, number}} دقيقة",
    minutes_other: "منذ {{count, number}} دقيقة",
    months_zero: "منذ {{count, number}} شهر",
    months_one: "منذ {{count, number}} شهر",
    months_two: "منذ {{count, number}} شهرين",
    months_few: "منذ {{count, number}} أشهر",
    months_many: "منذ {{count, number}} شهرًا",
    months_other: "منذ {{count, number}} شهر",
    years_zero: "منذ {{count, number}} سنة",
    years_one: "منذ {{count, number}} سنة",
    years_two: "منذ {{count, number}} سنتين",
    years_few: "منذ {{count, number}} سنوات",
    years_many: "منذ {{count, number}} سنة",
    years_other: "منذ {{count, number}} سنة",
  },
  descriptions: {
    attachedToSection: "تبقى التعليقات مرتبطة بهذا القسم.",
  },
  disabledReasons: {
    actorPreparing: "انتظر حتى تصبح التعليقات جاهزة.",
    duplicateHeading: "أعد تسمية عنوان مطابق، ثم أضف تعليقك.",
  },
  emptyStates: {
    noComments: "لا توجد تعليقات في هذا القسم حتى الآن.",
    noCommentsToReview: "لا توجد تعليقات للمراجعة.",
  },
  errors: {
    actorUnavailable: "التعليقات غير متاحة. أغلق التعليقات، ثم حاول مرة أخرى.",
    addFailed: "تعذرت إضافة التعليق. حاول مرة أخرى.",
    copyLinkFailed: "تعذر نسخ الرابط. حاول مرة أخرى.",
    deleteFailed: "تعذر حذف التعليق. حاول مرة أخرى.",
    loadFailed: "تعذر تحميل التعليقات. حاول مرة أخرى.",
    moveFailed: "تعذر نقل التعليق. حاول مرة أخرى.",
    reopenFailed: "تعذرت إعادة فتح التعليق. حاول مرة أخرى.",
    resolveFailed: "تعذر حل التعليق. حاول مرة أخرى.",
    saveFailed: "تعذر حفظ التعليق. حاول مرة أخرى.",
  },
  feedback: {
    added: "تمت إضافة التعليق.",
    deleted: "تم حذف التعليق.",
    moved: "تم نقل التعليق.",
    reopened: "تمت إعادة فتح التعليق.",
    resolved: "تم حل التعليق.",
    saved: "تم حفظ التعليق.",
  },
  placeholders: {
    newComment: "إضافة تعليق…",
  },
  states: {
    justNow: "الآن",
    loading: "جارٍ تحميل التعليقات…",
    preparing: "جارٍ إعداد التعليقات…",
    resolved: "تم الحل",
  },
} as const;

export const rtlCommentGuardedActions = {
  moveCommentToThisSection: "نقل التعليق إلى هذا القسم",
} as const;

export const rtlCommentDestructiveActions = {
  deleteComment: "حذف التعليق",
} as const;
