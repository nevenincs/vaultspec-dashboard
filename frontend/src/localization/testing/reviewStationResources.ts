const title = "title" as const;
const body = "body" as const;

export const ltrReviewStationResources = {
  accessibility: { loadingQueue: "Chargement des approbations" },
  actions: {
    hideChanges: "Masquer les modifications",
    requestChanges: "Demander des modifications",
    showChanges: "Afficher les modifications",
    submitForReview: "Soumettre pour révision",
  },
  requestChanges: {
    body: "Renvoyez cette proposition à l’assistant avec les modifications souhaitées.",
    commentLabel: "Modifications demandées",
    commentRequired: "Ajoutez une note décrivant les modifications demandées.",
    placeholder: "Décrivez les modifications à apporter…",
  },
  confirmations: {
    approve: {
      [title]: "Approuver cette proposition ?",
      [body]:
        "Approuvez cette proposition afin que ses modifications puissent être appliquées aux documents.",
    },
    apply: {
      [title]: "Appliquer ces modifications ?",
      [body]: "Appliquez les modifications approuvées aux documents concernés.",
    },
    reject: {
      [title]: "Rejeter cette proposition ?",
      [body]:
        "Rejetez cette proposition sans appliquer ses modifications aux documents.",
    },
    rollback: {
      [title]: "Préparer une annulation ?",
      [body]:
        "Préparez une nouvelle proposition qui annule les modifications appliquées aux documents.",
    },
  },
  statuses: {
    applied: "Appliquée",
    applying: "Application en cours",
    approved: "Approuvée",
    cancelled: "Annulée",
    compensationRequired: "Réparation nécessaire",
    conflicted: "En conflit",
    draft: "Brouillon",
    failed: "Échec",
    generating: "Génération en cours",
    needsReview: "Révision nécessaire",
    partiallyApplied: "Partiellement appliquée",
    proposed: "Proposée",
    rejected: "Rejetée",
    rollbackProposed: "Annulation proposée",
    superseded: "Remplacée",
    unknown: "État indisponible",
  },
  policy: {
    assistedHumanApproval: "Assisté, approbation du réviseur",
    assistedSystemApproval: "Assisté, approbation automatique",
    autonomousHumanApproval: "Autonome, approbation du réviseur",
    autonomousSystemApproval: "Autonome, approbation automatique",
    manualHumanApproval: "Manuel, approbation du réviseur",
    manualSystemApproval: "Manuel, approbation automatique",
    unavailable: "Règle d’approbation indisponible",
  },
  authorKinds: {
    agent: "Assistant",
    human: "Réviseur",
    system: "Système",
    toolExecutor: "Automatisation",
    unknown: "Auteur inconnu",
  },
  validation: {
    invalid: "Échec de la validation",
    stale: "Validation expirée",
    unavailable: "Validation indisponible",
    valid: "Validée",
    validWithWarnings: "Validée avec des avertissements",
  },
  stale: {
    policyChanged: "La règle de révision a changé",
    reviewChanged: "La révision a changé",
  },
  counts: {
    acknowledgements_one: "{{count, number}} accusé de réception",
    acknowledgements_many: "{{count, number}} accusés de réception",
    acknowledgements_other: "{{count, number}} accusés de réception",
    changes_one: "{{count, number}} modification",
    changes_many: "{{count, number}} modifications",
    changes_other: "{{count, number}} modifications",
  },
  disabledReasons: {
    actionInProgress: "Attendez la fin de l’action en cours.",
    actionUnavailable: "Actualisez la proposition, puis réessayez.",
    rollbackUnavailable:
      "Actualisez la proposition et vérifiez si l’annulation est disponible.",
  },
  feedback: {
    actionAccepted: "Demande acceptée.",
    actionNotAllowed: "Vérifiez la proposition et choisissez une action disponible.",
    rollbackUnavailable:
      "Actualisez la proposition et vérifiez si l’annulation est disponible.",
    reviewChanged: "Examinez la dernière proposition, puis réessayez.",
    reviewerUnavailable:
      "Cette action n’a pas pu être autorisée. Actualisez, puis réessayez.",
  },
  errors: {
    actionFailed: "L’action n’a pas pu être effectuée. Réessayez.",
    conflict:
      "Le document cible a changé après la révision. Résolvez le conflit avant d’appliquer.",
    queueUnavailable:
      "Les approbations sont indisponibles. Actualisez l’application, puis réessayez.",
  },
  states: {
    appliedAutomatically: "Appliquée automatiquement",
    empty: "Aucune proposition n’attend de révision.",
    informationMayBeOutOfDate:
      "Les informations d’approbation sont peut-être obsolètes. Actualisez-les pour obtenir les dernières informations.",
    loading: "Chargement des approbations…",
    moreAppliedChanges:
      "D’autres modifications appliquées automatiquement sont disponibles.",
    moreProposals:
      "D’autres propositions sont disponibles. Affinez la file pour les voir.",
    untitledProposal: "Proposition sans titre",
  },
  sections: { appliedAutomatically: "Appliquées automatiquement" },
  labels: { actionUnavailable: "Action indisponible" },
} as const;

export const ltrReviewStationGuardedActions = {
  reviewStationApproveProposal: "Approuver la proposition",
  reviewStationApplyChanges: "Appliquer les modifications",
  reviewStationPrepareRollback: "Préparer l’annulation",
} as const;

export const ltrReviewStationDestructiveActions = {
  reviewStationRejectProposal: "Rejeter la proposition",
} as const;

export const rtlReviewStationResources = {
  accessibility: { loadingQueue: "جارٍ تحميل الموافقات" },
  actions: {
    hideChanges: "إخفاء التغييرات",
    requestChanges: "طلب تغييرات",
    showChanges: "إظهار التغييرات",
    submitForReview: "الإرسال للمراجعة",
  },
  requestChanges: {
    body: "أعد هذا المقترح إلى المساعد مع التغييرات التي تريدها.",
    commentLabel: "التغييرات المطلوبة",
    commentRequired: "أضف ملاحظة تصف التغييرات المطلوبة.",
    placeholder: "صف التغييرات المطلوب إجراؤها…",
  },
  confirmations: {
    approve: {
      [title]: "هل تريد الموافقة على هذا المقترح؟",
      [body]: "وافق على هذا المقترح حتى يمكن تطبيق تغييراته على المستندات.",
    },
    apply: {
      [title]: "هل تريد تطبيق هذه التغييرات؟",
      [body]: "طبّق التغييرات الموافق عليها على المستندات المعنية.",
    },
    reject: {
      [title]: "هل تريد رفض هذا المقترح؟",
      [body]: "ارفض هذا المقترح من دون تطبيق تغييراته على المستندات.",
    },
    rollback: {
      [title]: "هل تريد إعداد تراجع؟",
      [body]: "أعد مقترحًا جديدًا يعكس التغييرات المطبقة على المستندات.",
    },
  },
  statuses: {
    applied: "مطبّق",
    applying: "جارٍ التطبيق",
    approved: "تمت الموافقة",
    cancelled: "ملغى",
    compensationRequired: "يحتاج إلى إصلاح",
    conflicted: "متعارض",
    draft: "مسودة",
    failed: "فشل",
    generating: "جارٍ الإنشاء",
    needsReview: "يحتاج إلى مراجعة",
    partiallyApplied: "مطبّق جزئيًا",
    proposed: "مقترح",
    rejected: "مرفوض",
    rollbackProposed: "تم اقتراح التراجع",
    superseded: "تم استبداله",
    unknown: "الحالة غير متاحة",
  },
  policy: {
    assistedHumanApproval: "مساعد، موافقة المراجع",
    assistedSystemApproval: "مساعد، موافقة تلقائية",
    autonomousHumanApproval: "ذاتي، موافقة المراجع",
    autonomousSystemApproval: "ذاتي، موافقة تلقائية",
    manualHumanApproval: "يدوي، موافقة المراجع",
    manualSystemApproval: "يدوي، موافقة تلقائية",
    unavailable: "سياسة الموافقة غير متاحة",
  },
  authorKinds: {
    agent: "مساعد",
    human: "مراجع",
    system: "النظام",
    toolExecutor: "أتمتة",
    unknown: "مؤلف غير معروف",
  },
  validation: {
    invalid: "فشل التحقق",
    stale: "انتهت صلاحية التحقق",
    unavailable: "التحقق غير متاح",
    valid: "تم التحقق",
    validWithWarnings: "تم التحقق مع تحذيرات",
  },
  stale: {
    policyChanged: "تغيرت سياسة المراجعة",
    reviewChanged: "تغيرت المراجعة",
  },
  counts: {
    acknowledgements_zero: "{{count, number}} إقرار",
    acknowledgements_one: "{{count, number}} إقرار",
    acknowledgements_two: "{{count, number}} إقراران",
    acknowledgements_few: "{{count, number}} إقرارات",
    acknowledgements_many: "{{count, number}} إقرارًا",
    acknowledgements_other: "{{count, number}} إقرار",
    changes_zero: "{{count, number}} تغيير",
    changes_one: "{{count, number}} تغيير",
    changes_two: "{{count, number}} تغييران",
    changes_few: "{{count, number}} تغييرات",
    changes_many: "{{count, number}} تغييرًا",
    changes_other: "{{count, number}} تغيير",
  },
  disabledReasons: {
    actionInProgress: "انتظر حتى ينتهي الإجراء الحالي.",
    actionUnavailable: "حدّث المقترح، ثم حاول مرة أخرى.",
    rollbackUnavailable: "حدّث المقترح وتحقق من توفر التراجع.",
  },
  feedback: {
    actionAccepted: "تم قبول الطلب.",
    actionNotAllowed: "راجع المقترح واختر إجراءً متاحًا.",
    rollbackUnavailable: "حدّث المقترح وتحقق من توفر التراجع.",
    reviewChanged: "راجع أحدث مقترح، ثم حاول مرة أخرى.",
    reviewerUnavailable: "تعذّر تفويض هذا الإجراء. حدّث، ثم حاول مرة أخرى.",
  },
  errors: {
    actionFailed: "تعذر إكمال الإجراء. حاول مرة أخرى.",
    conflict: "تغير المستند المستهدف بعد المراجعة. حل التعارض قبل التطبيق.",
    queueUnavailable: "الموافقات غير متاحة. حدّث التطبيق، ثم حاول مرة أخرى.",
  },
  states: {
    appliedAutomatically: "تم التطبيق تلقائيًا",
    empty: "لا توجد مقترحات تنتظر المراجعة.",
    informationMayBeOutOfDate:
      "قد تكون معلومات الموافقة قديمة. حدّثها للحصول على أحدث المعلومات.",
    loading: "جارٍ تحميل الموافقات…",
    moreAppliedChanges: "تتوفر تغييرات أخرى مطبقة تلقائيًا.",
    moreProposals: "تتوفر مقترحات أخرى. ضيّق قائمة الانتظار لرؤيتها.",
    untitledProposal: "مقترح بلا عنوان",
  },
  sections: { appliedAutomatically: "مطبّق تلقائيًا" },
  labels: { actionUnavailable: "الإجراء غير متاح" },
} as const;

export const rtlReviewStationGuardedActions = {
  reviewStationApproveProposal: "الموافقة على المقترح",
  reviewStationApplyChanges: "تطبيق التغييرات",
  reviewStationPrepareRollback: "إعداد التراجع",
} as const;

export const rtlReviewStationDestructiveActions = {
  reviewStationRejectProposal: "رفض المقترح",
} as const;
