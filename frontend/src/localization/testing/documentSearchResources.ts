export const ltrDocumentSearchResources = {
  accessibility: {
    dialog: "Rechercher un document",
    results: "Documents",
  },
  counts: {
    documents_many: "{{count, number}} documents",
    documents_one: "{{count, number}} document",
    documents_other: "{{count, number}} documents",
  },
  placeholders: {
    query: "Rechercher des documents par nom…",
  },
  states: {
    idle: "Recherchez un document par nom.",
    noMatches: "Aucun document ne correspond à « {{query}} ».",
    searching: "Recherche de documents en cours…",
    unavailable: "Les documents sont temporairement indisponibles. Réessayez.",
  },
} as const;

export const rtlDocumentSearchResources = {
  accessibility: {
    dialog: "البحث عن مستند",
    results: "المستندات",
  },
  counts: {
    documents_few: "{{count, number}} مستندات",
    documents_many: "{{count, number}} مستندًا",
    documents_one: "{{count, number}} مستند",
    documents_other: "{{count, number}} مستند",
    documents_two: "عدد المستندات: {{count, number}}",
    documents_zero: "{{count, number}} مستند",
  },
  placeholders: {
    query: "ابحث عن مستند بالاسم…",
  },
  states: {
    idle: "ابحث عن مستند بالاسم.",
    noMatches: "لا يوجد مستند يطابق «{{query}}».",
    searching: "جارٍ البحث عن المستندات…",
    unavailable: "المستندات غير متاحة مؤقتًا. حاول مرة أخرى.",
  },
} as const;
