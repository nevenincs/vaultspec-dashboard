import { en } from "../../locales/en";

export const ltrSearchMaintenanceResources = {
  ...en.operations.searchMaintenance,
  actions: {
    ...en.operations.searchMaintenance.actions,
    stop: "Arrêter la recherche",
    update: "Mettre à jour la recherche",
  },
  jobs: {
    ...en.operations.searchMaintenance.jobs,
    count_many: "{{count, number}} mises à jour",
    partial_many: "{{shown, number}} mises à jour chargées sur {{count, number}}.",
    update: "Mise à jour de recherche",
  },
  projects: {
    ...en.operations.searchMaintenance.projects,
    live_many: "{{count, number}} actifs",
    partial_many: "{{shown, number}} projets couverts sur {{count, number}}.",
    summary_many: "{{live, number}} actifs, {{count, number}} inactifs",
  },
  states: {
    ...en.operations.searchMaintenance.states,
    statusUnavailable: "État indisponible",
  },
} as const;

export const rtlSearchMaintenanceResources = {
  ...en.operations.searchMaintenance,
  actions: {
    ...en.operations.searchMaintenance.actions,
    stop: "إيقاف البحث",
    update: "تحديث البحث",
  },
  jobs: {
    ...en.operations.searchMaintenance.jobs,
    count_zero: "{{count, number}} تحديث",
    count_two: "{{count, number}} تحديثان",
    count_few: "{{count, number}} تحديثات",
    count_many: "{{count, number}} تحديثًا",
    partial_zero: "تم تحميل {{shown, number}} من {{count, number}} تحديث.",
    partial_two: "تم تحميل {{shown, number}} من {{count, number}} تحديثين.",
    partial_few: "تم تحميل {{shown, number}} من {{count, number}} تحديثات.",
    partial_many: "تم تحميل {{shown, number}} من {{count, number}} تحديثًا.",
    update: "تحديث البحث",
  },
  projects: {
    ...en.operations.searchMaintenance.projects,
    live_zero: "{{count, number}} نشط",
    live_two: "{{count, number}} مشروعان نشطان",
    live_few: "{{count, number}} مشاريع نشطة",
    live_many: "{{count, number}} مشروعًا نشطًا",
    partial_zero: "تغطية {{shown, number}} من {{count, number}} مشروع.",
    partial_two: "تغطية {{shown, number}} من {{count, number}} مشروعين.",
    partial_few: "تغطية {{shown, number}} من {{count, number}} مشاريع.",
    partial_many: "تغطية {{shown, number}} من {{count, number}} مشروعًا.",
    summary_zero: "{{live, number}} نشط، {{count, number}} غير نشط",
    summary_two: "{{live, number}} نشط، {{count, number}} مشروعان غير نشطين",
    summary_few: "{{live, number}} نشط، {{count, number}} غير نشطة",
    summary_many: "{{live, number}} نشط، {{count, number}} غير نشط",
  },
  states: {
    ...en.operations.searchMaintenance.states,
    statusUnavailable: "الحالة غير متاحة",
  },
} as const;
