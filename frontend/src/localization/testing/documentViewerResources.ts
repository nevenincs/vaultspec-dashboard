export const ltrDocumentViewerReaderResources = {
  accessibility: {
    document: "Document",
  },
  errors: {
    loadFailed:
      "Le document n’a pas pu être chargé. Fermez-le, puis ouvrez-le de nouveau.",
    temporarilyUnavailable:
      "Le document est temporairement indisponible. Réessayez dans un instant.",
  },
  labels: {
    created: "Créé",
    document: "Document",
    readOnly: "Lecture seule",
    relatedDocuments: "Documents associés",
    tags: "Étiquettes",
    updated: "Mis à jour",
  },
  metadata: {
    readTime_one: "Lecture : {{count, number}} min",
    readTime_many: "Lecture : {{count, number}} min",
    readTime_other: "Lecture : {{count, number}} min",
    readTimeStatus_one: "Lecture : {{count, number}} min · {{status}}",
    readTimeStatus_many: "Lecture : {{count, number}} min · {{status}}",
    readTimeStatus_other: "Lecture : {{count, number}} min · {{status}}",
    createdReadTime_one: "Créé le {{created}} · Lecture : {{count, number}} min",
    createdReadTime_many: "Créé le {{created}} · Lecture : {{count, number}} min",
    createdReadTime_other: "Créé le {{created}} · Lecture : {{count, number}} min",
    createdReadTimeStatus_one:
      "Créé le {{created}} · Lecture : {{count, number}} min · {{status}}",
    createdReadTimeStatus_many:
      "Créé le {{created}} · Lecture : {{count, number}} min · {{status}}",
    createdReadTimeStatus_other:
      "Créé le {{created}} · Lecture : {{count, number}} min · {{status}}",
    updatedReadTime_one: "Mis à jour le {{updated}} · Lecture : {{count, number}} min",
    updatedReadTime_many: "Mis à jour le {{updated}} · Lecture : {{count, number}} min",
    updatedReadTime_other:
      "Mis à jour le {{updated}} · Lecture : {{count, number}} min",
    updatedReadTimeStatus_one:
      "Mis à jour le {{updated}} · Lecture : {{count, number}} min · {{status}}",
    updatedReadTimeStatus_many:
      "Mis à jour le {{updated}} · Lecture : {{count, number}} min · {{status}}",
    updatedReadTimeStatus_other:
      "Mis à jour le {{updated}} · Lecture : {{count, number}} min · {{status}}",
    createdUpdatedReadTime_one:
      "Créé le {{created}} · Mis à jour le {{updated}} · Lecture : {{count, number}} min",
    createdUpdatedReadTime_many:
      "Créé le {{created}} · Mis à jour le {{updated}} · Lecture : {{count, number}} min",
    createdUpdatedReadTime_other:
      "Créé le {{created}} · Mis à jour le {{updated}} · Lecture : {{count, number}} min",
    createdUpdatedReadTimeStatus_one:
      "Créé le {{created}} · Mis à jour le {{updated}} · Lecture : {{count, number}} min · {{status}}",
    createdUpdatedReadTimeStatus_many:
      "Créé le {{created}} · Mis à jour le {{updated}} · Lecture : {{count, number}} min · {{status}}",
    createdUpdatedReadTimeStatus_other:
      "Créé le {{created}} · Mis à jour le {{updated}} · Lecture : {{count, number}} min · {{status}}",
  },
  states: {
    empty: "Ce document est vide.",
    loading: "Chargement du document…",
    missing: "Ce document n’est pas disponible ici. Choisissez un autre document.",
  },
  statuses: {
    accepted: "Accepté",
    active: "Actif",
    complete: "Terminé",
    deprecated: "Retiré",
    proposed: "Proposé",
    rejected: "Rejeté",
    superseded: "Remplacé",
    unavailable: "État indisponible",
  },
  truncation: {
    bytes_one:
      "Affichage du premier {{returned, number}} octet sur {{count, number}}. Ouvrez le fichier pour voir le document complet.",
    bytes_many:
      "Affichage des {{returned, number}} premiers octets sur {{count, number}}. Ouvrez le fichier pour voir le document complet.",
    bytes_other:
      "Affichage des {{returned, number}} premiers octets sur {{count, number}}. Ouvrez le fichier pour voir le document complet.",
  },
} as const;

export const ltrCodeViewerResources = {
  accessibility: { contents: "Contenu du code" },
  errors: {
    loadFailed:
      "Le fichier n’a pas pu être chargé. Fermez-le, puis ouvrez-le de nouveau.",
    temporarilyUnavailable:
      "Le fichier est temporairement indisponible. Réessayez dans un instant.",
  },
  footer: {
    summary_one: "Lecture seule, {{count, number}} ligne, {{encoding}}, {{language}}",
    summary_many: "Lecture seule, {{count, number}} lignes, {{encoding}}, {{language}}",
    summary_other:
      "Lecture seule, {{count, number}} lignes, {{encoding}}, {{language}}",
  },
  labels: { code: "Code", readOnly: "Lecture seule" },
  states: {
    empty: "Ce fichier est vide.",
    loading: "Chargement du code…",
    missing: "Ce fichier n’est pas disponible ici. Choisissez un autre fichier.",
  },
} as const;

export const rtlDocumentViewerReaderResources = {
  accessibility: {
    document: "المستند",
  },
  errors: {
    loadFailed: "تعذر تحميل المستند. أغلقه، ثم افتحه مرة أخرى.",
    temporarilyUnavailable: "المستند غير متاح مؤقتًا. حاول مرة أخرى بعد قليل.",
  },
  labels: {
    created: "تاريخ الإنشاء",
    document: "مستند",
    readOnly: "للقراءة فقط",
    relatedDocuments: "المستندات المرتبطة",
    tags: "الوسوم",
    updated: "تاريخ التحديث",
  },
  metadata: {
    readTime_zero: "{{count, number}} دقيقة للقراءة",
    readTime_one: "وقت القراءة بالدقائق: {{count, number}}",
    readTime_two: "وقت القراءة بالدقائق: {{count, number}}",
    readTime_few: "{{count, number}} دقائق للقراءة",
    readTime_many: "{{count, number}} دقيقة للقراءة",
    readTime_other: "{{count, number}} دقيقة للقراءة",
    readTimeStatus_zero: "{{count, number}} دقيقة للقراءة · {{status}}",
    readTimeStatus_one: "وقت القراءة بالدقائق: {{count, number}} · {{status}}",
    readTimeStatus_two: "وقت القراءة بالدقائق: {{count, number}} · {{status}}",
    readTimeStatus_few: "{{count, number}} دقائق للقراءة · {{status}}",
    readTimeStatus_many: "{{count, number}} دقيقة للقراءة · {{status}}",
    readTimeStatus_other: "{{count, number}} دقيقة للقراءة · {{status}}",
    createdReadTime_zero: "تاريخ الإنشاء {{created}} · {{count, number}} دقيقة للقراءة",
    createdReadTime_one:
      "تاريخ الإنشاء {{created}} · وقت القراءة بالدقائق: {{count, number}}",
    createdReadTime_two:
      "تاريخ الإنشاء {{created}} · وقت القراءة بالدقائق: {{count, number}}",
    createdReadTime_few: "تاريخ الإنشاء {{created}} · {{count, number}} دقائق للقراءة",
    createdReadTime_many: "تاريخ الإنشاء {{created}} · {{count, number}} دقيقة للقراءة",
    createdReadTime_other:
      "تاريخ الإنشاء {{created}} · {{count, number}} دقيقة للقراءة",
    createdReadTimeStatus_zero:
      "تاريخ الإنشاء {{created}} · {{count, number}} دقيقة للقراءة · {{status}}",
    createdReadTimeStatus_one:
      "تاريخ الإنشاء {{created}} · وقت القراءة بالدقائق: {{count, number}} · {{status}}",
    createdReadTimeStatus_two:
      "تاريخ الإنشاء {{created}} · وقت القراءة بالدقائق: {{count, number}} · {{status}}",
    createdReadTimeStatus_few:
      "تاريخ الإنشاء {{created}} · {{count, number}} دقائق للقراءة · {{status}}",
    createdReadTimeStatus_many:
      "تاريخ الإنشاء {{created}} · {{count, number}} دقيقة للقراءة · {{status}}",
    createdReadTimeStatus_other:
      "تاريخ الإنشاء {{created}} · {{count, number}} دقيقة للقراءة · {{status}}",
    updatedReadTime_zero: "تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة",
    updatedReadTime_one:
      "تاريخ التحديث {{updated}} · وقت القراءة بالدقائق: {{count, number}}",
    updatedReadTime_two:
      "تاريخ التحديث {{updated}} · وقت القراءة بالدقائق: {{count, number}}",
    updatedReadTime_few: "تاريخ التحديث {{updated}} · {{count, number}} دقائق للقراءة",
    updatedReadTime_many: "تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة",
    updatedReadTime_other:
      "تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة",
    updatedReadTimeStatus_zero:
      "تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة · {{status}}",
    updatedReadTimeStatus_one:
      "تاريخ التحديث {{updated}} · وقت القراءة بالدقائق: {{count, number}} · {{status}}",
    updatedReadTimeStatus_two:
      "تاريخ التحديث {{updated}} · وقت القراءة بالدقائق: {{count, number}} · {{status}}",
    updatedReadTimeStatus_few:
      "تاريخ التحديث {{updated}} · {{count, number}} دقائق للقراءة · {{status}}",
    updatedReadTimeStatus_many:
      "تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة · {{status}}",
    updatedReadTimeStatus_other:
      "تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة · {{status}}",
    createdUpdatedReadTime_zero:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة",
    createdUpdatedReadTime_one:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · وقت القراءة بالدقائق: {{count, number}}",
    createdUpdatedReadTime_two:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · وقت القراءة بالدقائق: {{count, number}}",
    createdUpdatedReadTime_few:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · {{count, number}} دقائق للقراءة",
    createdUpdatedReadTime_many:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة",
    createdUpdatedReadTime_other:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة",
    createdUpdatedReadTimeStatus_zero:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة · {{status}}",
    createdUpdatedReadTimeStatus_one:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · وقت القراءة بالدقائق: {{count, number}} · {{status}}",
    createdUpdatedReadTimeStatus_two:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · وقت القراءة بالدقائق: {{count, number}} · {{status}}",
    createdUpdatedReadTimeStatus_few:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · {{count, number}} دقائق للقراءة · {{status}}",
    createdUpdatedReadTimeStatus_many:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة · {{status}}",
    createdUpdatedReadTimeStatus_other:
      "تاريخ الإنشاء {{created}} · تاريخ التحديث {{updated}} · {{count, number}} دقيقة للقراءة · {{status}}",
  },
  states: {
    empty: "هذا المستند فارغ.",
    loading: "جارٍ تحميل المستند…",
    missing: "هذا المستند غير متاح هنا. اختر مستندًا آخر.",
  },
  statuses: {
    accepted: "مقبول",
    active: "نشط",
    complete: "مكتمل",
    deprecated: "مسحوب",
    proposed: "مقترح",
    rejected: "مرفوض",
    superseded: "مستبدل",
    unavailable: "الحالة غير متاحة",
  },
  truncation: {
    bytes_zero:
      "يظهر أول {{returned, number}} من أصل {{count, number}} بايت. افتح الملف لعرض المستند كاملًا.",
    bytes_one:
      "يظهر أول {{returned, number}} من أصل {{count, number}} بايت. افتح الملف لعرض المستند كاملًا.",
    bytes_two:
      "يظهر أول {{returned, number}} من أصل {{count, number}} بايتين. افتح الملف لعرض المستند كاملًا.",
    bytes_few:
      "يظهر أول {{returned, number}} من أصل {{count, number}} بايتات. افتح الملف لعرض المستند كاملًا.",
    bytes_many:
      "يظهر أول {{returned, number}} من أصل {{count, number}} بايت. افتح الملف لعرض المستند كاملًا.",
    bytes_other:
      "يظهر أول {{returned, number}} من أصل {{count, number}} بايت. افتح الملف لعرض المستند كاملًا.",
  },
} as const;

export const rtlCodeViewerResources = {
  accessibility: { contents: "محتوى الشفرة" },
  errors: {
    loadFailed: "تعذر تحميل الملف. أغلقه، ثم افتحه مرة أخرى.",
    temporarilyUnavailable: "الملف غير متاح مؤقتًا. حاول مرة أخرى بعد قليل.",
  },
  footer: {
    summary_zero: "للقراءة فقط، {{count, number}} سطر، {{encoding}}، {{language}}",
    summary_one:
      "للقراءة فقط، عدد الأسطر: {{count, number}}، {{encoding}}، {{language}}",
    summary_two:
      "للقراءة فقط، عدد الأسطر: {{count, number}}، {{encoding}}، {{language}}",
    summary_few: "للقراءة فقط، {{count, number}} أسطر، {{encoding}}، {{language}}",
    summary_many: "للقراءة فقط، {{count, number}} سطرًا، {{encoding}}، {{language}}",
    summary_other: "للقراءة فقط، {{count, number}} سطر، {{encoding}}، {{language}}",
  },
  labels: { code: "شفرة", readOnly: "للقراءة فقط" },
  states: {
    empty: "هذا الملف فارغ.",
    loading: "جارٍ تحميل الشفرة…",
    missing: "هذا الملف غير متاح هنا. اختر ملفًا آخر.",
  },
} as const;
