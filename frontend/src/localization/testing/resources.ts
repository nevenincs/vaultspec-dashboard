import { en, sourceLocale } from "../../locales/en";

export const ltrTestLocale = "fr" as const;
export const rtlTestLocale = "ar" as const;

export const ltrTestResources = {
  common: {
    actions: {
      cancel: "Annuler",
      close: "Fermer",
      reloadPage: "Recharger la page",
      retry: "Réessayer",
    },
    destructiveActions: {
      discardChanges: "Ignorer les modifications",
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
} as const;

export const rtlTestResources = {
  common: {
    actions: {
      cancel: "إلغاء",
      close: "إغلاق",
      reloadPage: "إعادة تحميل الصفحة",
      retry: "إعادة المحاولة",
    },
    destructiveActions: {
      discardChanges: "تجاهل التغييرات",
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
} as const;

export const testResources = {
  [sourceLocale]: en,
  [ltrTestLocale]: ltrTestResources,
  [rtlTestLocale]: rtlTestResources,
} as const;

export type TestLocale = keyof typeof testResources;
