export const ltrCanvasResources = {
  emptyStates: {
    noFilterMatches: "Aucun élément ne correspond à vos filtres.",
  },
  errors: {
    unavailable:
      "Impossible de charger la carte du projet. Actualisez les données, puis réessayez.",
    partialUnavailable:
      "Certains détails de la carte du projet sont indisponibles. Actualisez les données, puis réessayez.",
    graphicsTitle: "Carte du projet indisponible",
    graphicsMessage:
      "Ouvrez les réglages du système, activez l’accélération graphique, puis rouvrez l’application.",
  },
  states: {
    loading: "Chargement de la carte du projet…",
    restoring: "Restauration de la carte du projet…",
    loadingDetails: "Chargement de détails supplémentaires de la carte du projet…",
    loadingDocumentLinks: "Chargement des liens entre les documents…",
    truncated: "Affichage de {{returned, number}} éléments sur {{total, number}}.",
    refreshingDocumentLinks: "Actualisation des liens entre les documents…",
    refreshing: "Actualisation de la carte du projet…",
  },
} as const;

export const rtlCanvasResources = {
  emptyStates: {
    noFilterMatches: "لا توجد عناصر تطابق عوامل التصفية.",
  },
  errors: {
    unavailable: "تعذر تحميل خريطة المشروع. حدّث البيانات، ثم حاول مرة أخرى.",
    partialUnavailable:
      "بعض تفاصيل خريطة المشروع غير متاحة. حدّث البيانات، ثم حاول مرة أخرى.",
    graphicsTitle: "خريطة المشروع غير متاحة",
    graphicsMessage: "افتح إعدادات النظام، وفعّل تسريع الرسومات، ثم أعد فتح التطبيق.",
  },
  states: {
    loading: "جارٍ تحميل خريطة المشروع…",
    restoring: "جارٍ استعادة خريطة المشروع…",
    loadingDetails: "جارٍ تحميل المزيد من تفاصيل خريطة المشروع…",
    loadingDocumentLinks: "جارٍ تحميل الروابط بين المستندات…",
    truncated: "يتم عرض {{returned, number}} من أصل {{total, number}} عنصرًا.",
    refreshingDocumentLinks: "جارٍ تحديث الروابط بين المستندات…",
    refreshing: "جارٍ تحديث خريطة المشروع…",
  },
} as const;
