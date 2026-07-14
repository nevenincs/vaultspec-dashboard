import { en, sourceLocale } from "../../locales/en";

export const ltrTestLocale = "fr" as const;
export const rtlTestLocale = "ar" as const;

export const ltrTestResources = {
  common: {
    actions: {
      ...en.common.actions,
      cancel: "Annuler",
      close: "Fermer",
      reloadPage: "Recharger la page",
      retry: "Réessayer",
    },
    disabledReasons: en.common.disabledReasons,
    destructiveActions: {
      discardChanges: "Ignorer les modifications",
    },
  },
  documents: en.documents,
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
  features: en.features,
  projects: en.projects,
} as const;

export const rtlTestResources = {
  common: {
    actions: {
      ...en.common.actions,
      cancel: "إلغاء",
      close: "إغلاق",
      reloadPage: "إعادة تحميل الصفحة",
      retry: "إعادة المحاولة",
    },
    disabledReasons: en.common.disabledReasons,
    destructiveActions: {
      discardChanges: "تجاهل التغييرات",
    },
  },
  documents: en.documents,
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
  features: en.features,
  projects: en.projects,
} as const;

export const testResources = {
  [sourceLocale]: en,
  [ltrTestLocale]: ltrTestResources,
  [rtlTestLocale]: rtlTestResources,
} as const;

export type TestLocale = keyof typeof testResources;
