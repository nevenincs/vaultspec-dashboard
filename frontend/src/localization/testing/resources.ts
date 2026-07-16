import { en, sourceLocale } from "../../locales/en";
import {
  ltrAddProjectDialogResources,
  rtlAddProjectDialogResources,
} from "./addProjectResources";
import {
  ltrCommentDestructiveActions,
  ltrCommentGuardedActions,
  ltrCommentResources,
  rtlCommentDestructiveActions,
  rtlCommentGuardedActions,
  rtlCommentResources,
} from "./commentResources";
import { ltrGraphResources, rtlGraphResources } from "./graphResources";
import {
  ltrDocumentSearchResources,
  rtlDocumentSearchResources,
} from "./documentSearchResources";
import {
  ltrDocumentPropertiesResources,
  rtlDocumentPropertiesResources,
} from "./documentPropertiesResources";
import {
  ltrCodeViewerResources,
  ltrDocumentViewerReaderResources,
  rtlCodeViewerResources,
  rtlDocumentViewerReaderResources,
} from "./documentViewerResources";
import {
  ltrFolderBrowserResources,
  ltrPlacesRailResources,
  rtlFolderBrowserResources,
  rtlPlacesRailResources,
} from "./pickerResources";
import {
  ltrReviewStationDestructiveActions,
  ltrReviewStationGuardedActions,
  ltrReviewStationResources,
  rtlReviewStationDestructiveActions,
  rtlReviewStationGuardedActions,
  rtlReviewStationResources,
} from "./reviewStationResources";
import { ltrTimelineResources, rtlTimelineResources } from "./timelineResources";
import {
  ltrWorkspaceIdentityResources,
  rtlWorkspaceIdentityResources,
} from "./workspaceIdentityResources";
import {
  ltrSearchPaletteResources,
  rtlSearchPaletteResources,
} from "./searchPaletteResources";
import {
  ltrLanguageDisplayResources,
  rtlLanguageDisplayResources,
} from "./languageDisplayResources";
import {
  ltrSearchMaintenanceResources,
  rtlSearchMaintenanceResources,
} from "./searchMaintenanceResources";
import { ltrCS, ltrDS, rtlCS, rtlDS } from "./shellResources";
import { ltrVW, rtlVW } from "./viewerWaveResources";

export const ltrTestLocale = "fr" as const;
export const rtlTestLocale = "ar" as const;

export const ltrTestResources = {
  common: {
    systemStatus: {
      ...en.common.systemStatus,
      labels: { ...en.common.systemStatus.labels, application: "Application test" },
      states: {
        ...en.common.systemStatus.states,
        statusUnavailable: "État indisponible",
      },
    },
    accessibility: ltrCS.accessibility,
    finalWave: ltrCS.finalWave,
    kit: ltrCS.kit,
    rail: ltrCS.rail,
    shell: ltrCS.shell,
    actions: {
      ...en.common.actions,
      ...ltrCS.actions,
      cancel: "Annuler",
      close: "Fermer",
      clearSearch: "Effacer la recherche",
      collapseNavigationPanel: "Réduire le panneau de navigation",
      copyBranchName: "Copier le nom de la branche",
      copyCategoryName: "Copier le nom de la catégorie",
      copyCommitHash: "Copier l’empreinte de validation",
      copyCommitMessage: "Copier le message de validation",
      copyFeatureTag: "Copier l’étiquette de la fonctionnalité",
      copyPullRequestLink: "Copier le lien de la demande de fusion",
      copyPullRequestNumber: "Copier le numéro de la demande de fusion",
      copyShortCommitHash: "Copier l’empreinte courte de validation",
      hideActivityPanel: "Masquer le panneau d’activité",
      hideNavigationPanel: "Masquer le panneau de navigation",
      hideTimeline: "Masquer la chronologie",
      moveToNextPanel: "Passer au panneau suivant",
      moveToPreviousPanel: "Passer au panneau précédent",
      openCommandPalette: "Ouvrir la palette de commandes…",
      openFilters: "Ouvrir les filtres",
      refreshData: "Actualiser les données",
      reloadPage: "Recharger la page",
      reset: "Réinitialiser",
      resetLayout: "Réinitialiser la disposition",
      retry: "Réessayer",
      expandNavigationPanel: "Développer le panneau de navigation",
      searchDocumentsAndCode: "Rechercher dans les documents et le code…",
      showActivityPanel: "Afficher le panneau d’activité",
      showNavigationPanel: "Afficher le panneau de navigation",
      showTimeline: "Afficher la chronologie",
      showChanges: "Afficher les modifications",
      showKeyboardShortcuts: "Afficher les raccourcis clavier",
      showOnCanvas: "Afficher sur le canevas",
      showOrHideGraph: "Afficher ou masquer le graphe",
      showStatus: "Afficher l’état",
    },
    activityTabs: {
      changes: "Modifications",
      status: "État",
    },
    commandFamilies: {
      editing: "Modification",
      filters: "Filtres",
      focus: "Focus",
      general: "Général",
      help: "Aide",
      layout: "Disposition",
      navigation: "Navigation",
      refresh: "Actualisation",
      search: "Recherche",
      searchMaintenance: "Maintenance de la recherche",
      settings: "Paramètres",
      workspaceMaintenance: "Maintenance de l’espace de travail",
    },
    commandPalette: {
      dialogLabel: "Palette de commandes",
      inputPlaceholder: "Rechercher des commandes",
      listboxLabel: "Commandes",
      noMatches: "Aucune commande correspondante",
      loading: "Chargement des commandes…",
      selectionAnnouncement_many: "{{count, number}} commandes. {{command}}",
      selectionAnnouncement_one: "{{count, number}} commande. {{command}}",
      selectionAnnouncement_other: "{{count, number}} commandes. {{command}}",
      footer: {
        navigate: "Naviguer",
        open: "Ouvrir",
        close: "Fermer",
      },
    },
    searchPalette: ltrSearchPaletteResources,
    controlPanels: {
      labels: {
        search: "Recherche",
        projectHealth: "Santé du projet",
        systemStatus: "État du système",
        approvals: "Approbations",
      },
      actions: {
        showSearch: "Afficher la recherche",
        hideSearch: "Masquer la recherche",
        showProjectHealth: "Afficher la santé du projet",
        hideProjectHealth: "Masquer la santé du projet",
        showSystemStatus: "Afficher l’état du système",
        hideSystemStatus: "Masquer l’état du système",
        showApprovals: "Afficher les approbations",
        hideApprovals: "Masquer les approbations",
      },
      unavailableTitles: {
        search: "Recherche indisponible",
        projectHealth: "Santé du projet indisponible",
        systemStatus: "État du système indisponible",
        approvals: "Approbations indisponibles",
      },
      accessibility: {
        group: "État du projet",
        panelStatus: "{{panel}} : {{status}}",
      },
      tones: {
        workingNormally: "Fonctionne normalement",
        needsAttention: "Nécessite une attention",
        unavailable: "Indisponible",
        checking: "Vérification en cours",
      },
    },
    palette: {
      commandCount_many: "{{count, number}} commandes",
      commandCount_one: "{{count, number}} commande",
      commandCount_other: "{{count, number}} commandes",
    },
    disabledReasons: {
      ...en.common.disabledReasons,
      ...ltrCS.disabledReasons,
      itemUnavailableOnCanvas:
        "Actualisez les données, puis réessayez d’afficher cet élément sur le canevas.",
    },
    feedback: {
      actionUnavailable:
        "Impossible de terminer l’action. Rechargez la page et réessayez.",
      copyFailed: "Impossible de copier. Réessayez.",
      copySucceeded: "Copié.",
    },
    destructiveActions: {
      discardChanges: "Ignorer les modifications",
    },
    shortcutDialog: {
      description: "Consultez les raccourcis clavier disponibles.",
      title: "Raccourcis clavier",
    },
    shortcutSettings: {
      conflict:
        "Ce raccourci est déjà attribué à {{action}}. Choisissez un autre raccourci.",
      empty: "Aucun raccourci clavier disponible",
      recording: "Appuyez sur une touche…",
    },
    shortcutGroups: {
      general: "Général",
      graph: "Graphe",
      navigation: "Navigation",
      window: "Fenêtre",
    },
    keycaps: {
      ...en.common.keycaps,
      arrowDown: "Flèche vers le bas",
      arrowLeft: "Flèche vers la gauche",
      arrowRight: "Flèche vers la droite",
      arrowUp: "Flèche vers le haut",
      backspace: "Retour arrière",
      delete: "Supprimer",
      escape: "Échap",
      pageDown: "Page suivante",
      pageUp: "Page précédente",
      shift: "Maj",
      space: "Espace",
    },
    statuses: en.common.statuses,
  },
  documents: {
    ...en.documents,
    ...ltrDS,
    localizationWave: ltrVW,
    accessibility: {
      addDocumentToFeature: "Ajouter un document à une fonctionnalité",
      browserView: "Vue du navigateur",
      decisionAccepted: "Décision acceptée",
      decisionDeprecated: "Décision retirée",
      decisionProposed: "Décision proposée",
      decisionRejected: "Décision rejetée",
      decisionSuperseded: "Décision remplacée",
      planComplete: "Plan terminé",
      planInProgress: "Plan en cours",
      planNotStarted: "Plan non commencé",
      treeBrowser: "Arborescence des documents",
      switchReadingAndEditingShortcut:
        "Basculer entre la lecture et la modification ({{accelerator}})",
      treeOptionsSortedByLatestActivity:
        "Options de l’arborescence, triées par activité récente",
      treeOptionsSortedByDocumentCount:
        "Options de l’arborescence, triées par nombre de documents",
      treeOptionsSortedByName: "Options de l’arborescence, triées par nom",
      treeOptionsSortedByCreationDate:
        "Options de l’arborescence, triées par date de création",
      treeOptionsSortedByEditDate:
        "Options de l’arborescence, triées par date de modification",
      treeOptionsSortedByLength: "Options de l’arborescence, triées par longueur",
      treeOptionsSortedByWorkspaceShare:
        "Options de l’arborescence, triées par part de l’espace de travail",
    },
    actions: {
      ...en.documents.actions,
      addComment: "Ajouter un commentaire",
      addToFeature: "Ajouter à une fonctionnalité…",
      browseDocuments: "Parcourir les documents",
      browseFiles: "Parcourir les fichiers",
      closeAllDocuments: "Fermer tous les documents",
      closeDocument: "Fermer le document",
      closeOtherDocuments: "Fermer les autres documents",
      clearFilter: "Effacer le filtre des documents",
      closeActiveTab: "Fermer l’onglet du document actif",
      collapseCategory: "Réduire la catégorie",
      collapseTree: "Réduire l’arborescence des documents",
      expandTree: "Développer l’arborescence des documents",
      expandCategory: "Développer la catégorie",
      findByName: "Rechercher un document par nom…",
      finishEditing: "Terminer la modification",
      focusFilter: "Activer le filtre des documents",
      keepDocumentOpen: "Garder le document ouvert",
      keepTabOpen: "Garder l’onglet ouvert",
      nextTab: "Aller à l’onglet de document suivant",
      openComments: "Ouvrir les commentaires",
      previousTab: "Aller à l’onglet de document précédent",
      resetFilters: "Réinitialiser les filtres",
      resetSorting: "Réinitialiser le tri",
      reloadDocument: "Recharger le document",
      save: "Enregistrer le document",
      sortByLatestActivity: "Trier par activité récente",
      sortByDocumentCount: "Trier par nombre de documents",
      sortByName: "Trier par nom",
      sortByCreationDate: "Trier par date de création",
      sortByEditDate: "Trier par date de modification",
      sortByLength: "Trier par longueur",
      sortByWorkspaceShare: "Trier par part de l’espace de travail",
      showOrHideChanges: "Afficher ou masquer les modifications",
      showOrHideFilterOptions: "Afficher ou masquer les options de filtre",
      filterByDocumentType: "Filtrer par ce type de document",
      switchReadingAndEditing: "Basculer entre la lecture et la modification",
      switchView: "Basculer entre les documents et les fichiers",
    },
    guardedActions: {
      ...ltrReviewStationGuardedActions,
      ...ltrCommentGuardedActions,
    },
    destructiveActions: {
      ...ltrReviewStationDestructiveActions,
      ...ltrCommentDestructiveActions,
    },
    browserModes: {
      documents: "Documents",
      files: "Fichiers",
    },
    categories: {
      code: "Code",
    },
    codeTree: {
      accessibility: {
        browser: "Fichiers du projet",
        linkedToMap: "Affiché dans la carte du projet",
      },
      errors: {
        childUnavailable: "Impossible de charger ce dossier. Réessayez.",
        unavailable: "Impossible de charger les fichiers du projet. Réessayez.",
      },
      states: {
        childLoading: "Chargement du dossier…",
        degraded:
          "Les fichiers du projet sont indisponibles. Parcourez plutôt les documents.",
        empty: "Aucun fichier de projet trouvé.",
        loading: "Chargement des fichiers du projet…",
        truncated:
          "{{shown, number}} fichiers et dossiers chargés sur {{total, number}}.",
        truncatedUnknown: "D’autres fichiers et dossiers sont disponibles ici.",
      },
    },
    confirmations: {
      discardUnsavedChanges: {
        title: "Ignorer les modifications non enregistrées ?",
        body: "Les modifications non enregistrées du document seront perdues. Cette action est irréversible.",
      },
    },
    createDialog: {
      accessibility: {
        addLinkedDocument: "Ajouter un document lié",
        backToFeature: "Retour à la fonctionnalité",
        documentType: "Type de document",
        feature: "Fonctionnalité",
        linkedDocuments: "Documents liés",
        pipelineCoverage: "Progression du processus",
        removeLinkedDocument: "Supprimer {{document}}",
        title: "Titre",
      },
      actions: {
        back: "Retour",
        continue: "Continuer",
        create: "Créer",
        creating: "Création du document…",
      },
      descriptions: {
        documentStage:
          "Choisissez un type de document disponible. Les liens vers les documents associés récents sont ajoutés pour vous.",
        featureStage:
          "Choisissez la fonctionnalité à laquelle appartient ce travail, ou saisissez une nouvelle étiquette de fonctionnalité. Les nouveaux documents sont ajoutés au processus de la fonctionnalité.",
      },
      documentTypes: {
        adr: "Compte rendu de décision",
        audit: "Audit",
        document: "Document",
        exec: "Compte rendu d’étape",
        plan: "Plan",
        reference: "Référence",
        research: "Recherche",
      },
      emptyStates: {
        createFeatureTag: "Saisissez une nouvelle étiquette de fonctionnalité",
        noMatchingDocuments: "Aucun document correspondant",
      },
      errors: {
        createFailed:
          "Le document n’a pas pu être créé. Actualisez l’application, puis réessayez.",
        inFlight:
          "Ce document est toujours en cours de création. Patientez un instant, puis réessayez.",
        pathCollision:
          "Un document de ce type existe déjà aujourd’hui pour cette fonctionnalité. Choisissez un autre type ou réessayez demain.",
        projectChanged:
          "Le projet a changé avant la création du document. Vérifiez vos choix, puis réessayez.",
        scopeChanged:
          "L’emplacement du projet a changé. Rouvrez le projet, puis réessayez.",
      },
      hints: {
        adr: "Consigner une décision",
        audit: "Examiner le travail terminé ou démarrer un processus",
        notAvailable: "Ce type de document n’est pas encore disponible.",
        plan: "Planifier le travail",
        reference: "Relier le travail au code existant",
        requiresDecision: "Ajoutez d’abord un compte rendu de décision.",
        requiresResearchOrReference:
          "Ajoutez d’abord un document de recherche ou de référence.",
        research: "Explorer le problème",
      },
      labels: {
        documentType: "Type de document",
        feature: "Fonctionnalité",
        inThisFeature: "Dans cette fonctionnalité",
        linkedDocuments: "Documents liés",
        title: "Titre",
      },
      placeholders: {
        addLinkedDocument: "Ajouter un document lié",
        documentTitle: "Saisissez un titre de document",
        featureTag: "Saisissez une étiquette de fonctionnalité",
      },
      stages: {
        document: "Étape 2 sur 2 : ajouter un document",
        feature: "Étape 1 sur 2 : ajouter à une fonctionnalité",
      },
      states: {
        checkingCoverage: "Vérification de la progression de la fonctionnalité…",
        chooseFeatureForCoverage:
          "Choisissez ou saisissez une fonctionnalité pour voir sa progression.",
        coverageUnavailable:
          "La progression du projet n’est pas disponible. Actualisez les données du projet, puis réessayez.",
        emptyFeature:
          "Aucun document pour le moment. Ajoutez un document de recherche ou de référence pour démarrer cette fonctionnalité.",
        nextStep: "Étape suivante",
        notYet: "Pas encore",
        present: "Présent",
        selected: "Sélectionné",
      },
      titles: {
        document: "Ajouter un document",
        feature: "Ajouter à une fonctionnalité",
      },
      validation: {
        chooseAvailableDocumentType: "Choisissez un type de document disponible.",
        chooseDocumentType: "Choisissez un type de document.",
        chooseFeature: "Choisissez ou saisissez une fonctionnalité.",
        completeRequiredFields: "Saisissez une fonctionnalité et un titre.",
        requiresDecision: "Ajoutez d’abord un compte rendu de décision.",
        requiresResearchOrReference:
          "Ajoutez d’abord un document de recherche ou de référence.",
      },
    },
    documentTypes: {
      research: "Recherche",
      adr: "Décisions",
      plan: "Plans",
      exec: "Étapes",
      audit: "Audits",
      reference: "Références",
    },
    editor: {
      accessibility: {
        formattingToolbar: "Mise en forme",
      },
      actions: {
        bold: "Mettre en gras",
        italic: "Mettre en italique",
        inlineCode: "Appliquer le code en ligne",
        heading: "Ajouter un titre",
        bulletedList: "Ajouter une liste à puces",
        numberedList: "Ajouter une liste numérotée",
        quote: "Ajouter une citation",
        link: "Ajouter un lien",
        linkToDocument: "Ajouter un lien vers un document",
      },
    },
    documentSearch: ltrDocumentSearchResources,
    reviewStation: ltrReviewStationResources,
    viewer: {
      languages: ltrLanguageDisplayResources,
      accessibility: {
        documentMode: "Mode du document",
        documentProperties: "Propriétés du document",
        featureTag: "Étiquette de fonctionnalité",
      },
      modes: {
        edit: "Modification",
        view: "Lecture",
      },
      codeViewer: ltrCodeViewerResources,
      reader: ltrDocumentViewerReaderResources,
      comments: ltrCommentResources,
      properties: ltrDocumentPropertiesResources,
    },
    disabledReasons: {
      ...en.documents.disabledReasons,
      chooseTemporaryTab: "Choisissez un onglet temporaire à garder ouvert.",
      copyChangesBeforeReopening:
        "Copiez vos modifications, puis rouvrez le document avant d’enregistrer.",
      openForEditing: "Ouvrez un document à modifier.",
      openDocument: "Ouvrez d’abord un document.",
      openAnotherDocument: "Ouvrez un autre document, puis réessayez.",
      tryAfterSaving: "Réessayez une fois l’enregistrement terminé.",
      updateBeforeSaving: "Modifiez le document avant d’enregistrer.",
    },
    feedback: {
      alreadyLinked: "Ces documents sont déjà liés.",
      linkConflict:
        "Le document a été modifié avant de pouvoir être lié. Ouvrez-le, puis réessayez.",
      linkFailed: "Impossible de lier les documents. Réessayez.",
      linkInProgress: "Liaison des documents…",
      linkSucceeded: "Documents liés.",
    },
    tree: {
      created: "Créé le {{date}}",
      decisionStatusAccepted: "Acceptée",
      decisionStatusDeprecated: "Retirée",
      decisionStatusProposed: "Proposée",
      decisionStatusRejected: "Rejetée",
      decisionStatusSuperseded: "Remplacée",
      degraded: "Certains documents sont temporairement indisponibles.",
      lastEdited: "Dernière modification le {{date}}",
      emptyWorktree: "Aucun document dans cet arbre de travail pour le moment.",
      loading: "Chargement des documents…",
      noFilterMatches: "Aucun document ne correspond à ce filtre.",
      noFilterMatchesYet:
        "Aucun résultat pour le moment. La liste est toujours en cours de chargement.",
      partialAnnouncement: "Chargement des documents restants.",
      partialCount_one:
        "Chargement de la liste complète. {{count, number}} document disponible pour le moment.",
      partialCount_other:
        "Chargement de la liste complète. {{count, number}} documents disponibles pour le moment.",
      partialCount_many:
        "Chargement de la liste complète. {{count, number}} documents disponibles pour le moment.",
      planProgress: "{{done, number}} sur {{total, number}} terminés",
      sizeSummary_one: "{{count, number}} mot, {{size}}",
      sizeSummary_many: "{{count, number}} mots, {{size}}",
      sizeSummary_other: "{{count, number}} mots, {{size}}",
      unavailable:
        "Les documents sont indisponibles. Actualisez l’application, puis réessayez.",
      updated: "Mis à jour le {{date}}",
      vaultBrowser: "Navigateur du coffre",
      wordCount_one: "{{count, number}} mot",
      wordCount_many: "{{count, number}} mots",
      wordCount_other: "{{count, number}} mots",
      weightBelowThreshold: "Moins de {{threshold}}",
    },
    labels: {
      document: "Document",
      vault: "Coffre",
    },
    sortOptions: {
      latestActivity: "Activité récente",
      documentCount: "Nombre de documents",
      name: "Nom",
      creationDate: "Date de création",
      editDate: "Date de modification",
      length: "Longueur",
      workspaceShare: "Part de l’espace de travail",
    },
    shortcutGroups: {
      documents: "Documents",
      editing: "Modification du document",
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
  features: {
    ...en.features,
    actions: {
      collapse: "Réduire la fonctionnalité",
      expand: "Développer la fonctionnalité",
      moveToNextFeature: "Passer à la fonctionnalité suivante",
      moveToPreviousFeature: "Passer à la fonctionnalité précédente",
      filterByFeature: "Filtrer par cette fonctionnalité",
    },
    feedback: {
      archiveRejected:
        "La fonctionnalité n’a pas été archivée. Vérifiez-la, puis réessayez.",
      archiveSucceeded: "Fonctionnalité archivée.",
      archiveUnavailable: "Impossible d’archiver la fonctionnalité. Réessayez.",
      repairRejected:
        "La fonctionnalité n’a pas été réparée. Vérifiez-la, puis réessayez.",
      repairSucceeded: "Fonctionnalité réparée.",
      repairUnavailable: "Impossible de réparer la fonctionnalité. Réessayez.",
    },
    labels: {
      feature: "Fonctionnalités",
    },
  },
  graph: ltrGraphResources,
  operations: {
    ...en.operations,
    searchMaintenance: ltrSearchMaintenanceResources,
    actions: {
      applySearchSettings: "Appliquer les paramètres de recherche",
      checkVault: "Vérifier le coffre",
      checkWorkspace: "Vérifier l’espace de travail",
      disableSearch: "Désactiver la recherche",
      enableSearch: "Activer la recherche",
      refreshSearch: "Actualiser la recherche",
      showWorkspaceDetails: "Afficher les détails de l’espace de travail",
    },
    feedback: {
      applySearchSettings: {
        failed: "Impossible d’appliquer les paramètres de recherche. Réessayez.",
        running: "Application des paramètres de recherche…",
        succeeded: "Paramètres de recherche appliqués.",
        unavailable: "La recherche est indisponible. Activez-la, puis réessayez.",
      },
      checkWorkspace: {
        failed: "Impossible de vérifier l’espace de travail. Réessayez.",
        running: "Vérification de l’espace de travail…",
        succeeded: "Vérification de l’espace de travail terminée.",
      },
      disableSearch: {
        failed: "Impossible de désactiver la recherche. Réessayez.",
        running: "Désactivation de la recherche…",
        succeeded: "Recherche désactivée.",
      },
      enableSearch: {
        failed: "Impossible d’activer la recherche. Réessayez.",
        running: "Activation de la recherche…",
        succeeded: "Recherche activée.",
        unavailable: "La recherche reste indisponible. Réessayez.",
      },
      refreshSearch: {
        failed: "Impossible d’actualiser la recherche. Réessayez.",
        running: "Actualisation de la recherche…",
        succeeded: "Actualisation de la recherche lancée.",
        unavailable: "La recherche est indisponible. Activez-la, puis réessayez.",
      },
      showWorkspaceDetails: {
        failed: "Impossible de charger les détails de l’espace de travail. Réessayez.",
        running: "Chargement des détails de l’espace de travail…",
        succeeded: "Détails de l’espace de travail chargés.",
      },
    },
  },
  projects: {
    workspaceIdentity: ltrWorkspaceIdentityResources,
    addDialog: ltrAddProjectDialogResources,
    actions: {
      add: "Ajouter un projet…",
      checkProjectStatus: "Vérifier l’état du projet",
      clearHistory: "Effacer l’historique des projets",
      openPullRequest: "Ouvrir la demande de fusion",
      prepareProjectTools: "Configurer les outils du projet",
      setUpProject: "Configurer le projet",
      switch: "Changer de projet…",
      switchWorktree: "Basculer vers l’arbre de travail",
      updateProject: "Mettre à jour le projet",
      updateProjectTools: "Mettre à jour les outils du projet",
    },
    confirmations: {
      replaceSetup: {
        body: "Cette action remplace les fichiers de configuration existants et peut écraser vos modifications. Enregistrez une sauvegarde avant de continuer.",
        title: "Remplacer la configuration du projet ?",
      },
    },
    destructiveActions: {
      replaceSetup: "Remplacer la configuration du projet",
    },
    disabledReasons: {
      chooseWorktreeWithProjectFiles:
        "Choisissez un autre arbre de travail contenant les fichiers du projet.",
      installRequiredProjectTools:
        "Installez les outils de projet requis, puis réessayez.",
      noSetupChangesNeeded: "Revenez au projet pour continuer.",
      prepareFolderAsGitProject:
        "Préparez ce dossier comme projet Git, puis réessayez.",
      refreshProjectForPullRequest: "Actualisez les données du projet, puis réessayez.",
      setUpProjectFirst: "Configurez le projet, puis réessayez.",
      waitForProjectStatus:
        "Attendez le chargement de l’état du projet, puis réessayez.",
    },
    folderBrowser: ltrFolderBrowserResources,
    placesRail: ltrPlacesRailResources,
    provisioning: {
      description: "Configurez ce projet pour continuer.",
      details: {
        installRequiredProjectTools:
          "Installez les outils de projet requis, puis réessayez.",
        prepareFolderAsGitProject:
          "Préparez ce dossier comme projet Git, puis réessayez.",
      },
      progress: "Configuration du projet…",
      result: {
        completed: "Configuration du projet terminée",
        failed: "Échec de la configuration du projet",
        indeterminate:
          "La configuration est peut-être toujours en cours. Vérifiez l’état du projet avant de réessayer.",
        itemCount_one: "{{count, number}} élément",
        itemCount_many: "{{count, number}} éléments",
        itemCount_other: "{{count, number}} éléments",
        status: {
          created: "Créé",
          failed: "Échec",
          mixed: "Résultats mixtes",
          removed: "Supprimé",
          restored: "Restauré",
          skipped: "Ignoré",
          updated: "Mis à jour",
          upToDate: "Déjà à jour",
        },
      },
      startFailed: "La configuration du projet n’a pas pu démarrer. Réessayez.",
      statusUnavailable: "L’état du projet est indisponible",
      title: "Configuration du projet requise",
    },
    shortcutGroups: {
      projects: "Projets",
    },
  },
  settings: {
    actions: {
      useDarkTheme: "Utiliser le thème sombre",
      useHighContrastTheme: "Utiliser le thème à contraste élevé",
      useLightTheme: "Utiliser le thème clair",
      useSystemTheme: "Utiliser le thème du système",
    },
    groups: {
      appearance: "Apparence",
      graph: "Graphe",
      keybindings: "Raccourcis clavier",
    },
    fields: {
      theme: { label: "Thème", description: "Choisissez le thème de l’interface." },
      reduceMotion: {
        label: "Réduire les animations",
        description: "Utilisez moins d’animations dans l’interface.",
      },
      activitySectionFolds: {
        label: "Sections d’activité",
        description: "Mémorisez les sections d’activité ouvertes.",
      },
      language: {
        label: "Langue",
        description: "Choisissez la langue de l’interface.",
      },
      defaultGranularity: {
        label: "Niveau de détail par défaut",
        description: "Choisissez le niveau de détail initial du graphe.",
      },
      corpus: {
        label: "Contenu du graphe",
        description: "Choisissez le contenu affiché dans le graphe.",
      },
      timelineDate: {
        label: "Date de la chronologie",
        description: "Choisissez la date qui contrôle la chronologie.",
      },
      confidenceFloor: {
        label: "Certitude minimale des connexions",
        description: "Masquez les connexions sous ce niveau de certitude.",
      },
      labelFilter: {
        label: "Filtre par nom",
        description: "Affichez les éléments dont le nom correspond.",
        placeholder: "Filtrer par nom",
      },
      graphControls: {
        label: "Commandes du graphe",
        description: "Personnalisez la navigation du graphe.",
      },
      shortcuts: {
        label: "Raccourcis clavier",
        description: "Personnalisez les commandes clavier.",
      },
    },
    options: {
      system: "Système",
      light: "Clair",
      dark: "Sombre",
      highContrast: "Contraste élevé",
      english: "Anglais",
    },
  },
  timeline: ltrTimelineResources,
} as const;

export const rtlTestResources = {
  common: {
    systemStatus: {
      ...en.common.systemStatus,
      labels: { ...en.common.systemStatus.labels, application: "تطبيق اختباري" },
      states: {
        ...en.common.systemStatus.states,
        statusUnavailable: "الحالة غير متاحة",
      },
    },
    accessibility: rtlCS.accessibility,
    finalWave: rtlCS.finalWave,
    kit: rtlCS.kit,
    rail: rtlCS.rail,
    shell: rtlCS.shell,
    actions: {
      ...en.common.actions,
      ...rtlCS.actions,
      cancel: "إلغاء",
      close: "إغلاق",
      clearSearch: "مسح البحث",
      collapseNavigationPanel: "طي لوحة التنقل",
      copyBranchName: "نسخ اسم الفرع",
      copyCategoryName: "نسخ اسم الفئة",
      copyCommitHash: "نسخ بصمة الالتزام",
      copyCommitMessage: "نسخ رسالة الالتزام",
      copyFeatureTag: "نسخ وسم الميزة",
      copyPullRequestLink: "نسخ رابط طلب الدمج",
      copyPullRequestNumber: "نسخ رقم طلب الدمج",
      copyShortCommitHash: "نسخ بصمة الالتزام المختصرة",
      hideActivityPanel: "إخفاء لوحة النشاط",
      hideNavigationPanel: "إخفاء لوحة التنقل",
      hideTimeline: "إخفاء المخطط الزمني",
      moveToNextPanel: "الانتقال إلى اللوحة التالية",
      moveToPreviousPanel: "الانتقال إلى اللوحة السابقة",
      openCommandPalette: "فتح لوحة الأوامر…",
      openFilters: "فتح عوامل التصفية",
      refreshData: "تحديث البيانات",
      reloadPage: "إعادة تحميل الصفحة",
      reset: "إعادة تعيين",
      resetLayout: "إعادة تعيين التخطيط",
      retry: "إعادة المحاولة",
      expandNavigationPanel: "توسيع لوحة التنقل",
      searchDocumentsAndCode: "البحث في المستندات والتعليمات البرمجية…",
      showActivityPanel: "إظهار لوحة النشاط",
      showNavigationPanel: "إظهار لوحة التنقل",
      showTimeline: "إظهار المخطط الزمني",
      showChanges: "إظهار التغييرات",
      showOrHideGraph: "إظهار الرسم البياني أو إخفاؤه",
      showOnCanvas: "إظهار على اللوحة",
      showStatus: "إظهار الحالة",
    },
    activityTabs: {
      changes: "التغييرات",
      status: "الحالة",
    },
    commandFamilies: {
      editing: "التحرير",
      filters: "عوامل التصفية",
      focus: "التركيز",
      general: "عام",
      help: "المساعدة",
      layout: "التخطيط",
      navigation: "التنقل",
      refresh: "التحديث",
      search: "البحث",
      searchMaintenance: "صيانة البحث",
      settings: "الإعدادات",
      workspaceMaintenance: "صيانة مساحة العمل",
    },
    commandPalette: {
      dialogLabel: "لوحة الأوامر",
      inputPlaceholder: "البحث في الأوامر",
      listboxLabel: "الأوامر",
      noMatches: "لا توجد أوامر مطابقة",
      loading: "جارٍ تحميل الأوامر…",
      selectionAnnouncement_few: "{{count, number}} أوامر. {{command}}",
      selectionAnnouncement_many: "{{count, number}} أمرًا. {{command}}",
      selectionAnnouncement_one: "{{count, number}} أمر. {{command}}",
      selectionAnnouncement_other: "{{count, number}} أمر. {{command}}",
      selectionAnnouncement_two: "{{count, number}} أمران. {{command}}",
      selectionAnnouncement_zero: "{{count, number}} أمر. {{command}}",
      footer: {
        navigate: "تنقل",
        open: "فتح",
        close: "إغلاق",
      },
    },
    searchPalette: rtlSearchPaletteResources,
    controlPanels: {
      labels: {
        search: "البحث",
        projectHealth: "سلامة المشروع",
        systemStatus: "حالة النظام",
        approvals: "الموافقات",
      },
      actions: {
        showSearch: "إظهار البحث",
        hideSearch: "إخفاء البحث",
        showProjectHealth: "إظهار سلامة المشروع",
        hideProjectHealth: "إخفاء سلامة المشروع",
        showSystemStatus: "إظهار حالة النظام",
        hideSystemStatus: "إخفاء حالة النظام",
        showApprovals: "إظهار الموافقات",
        hideApprovals: "إخفاء الموافقات",
      },
      unavailableTitles: {
        search: "البحث غير متاح",
        projectHealth: "سلامة المشروع غير متاحة",
        systemStatus: "حالة النظام غير متاحة",
        approvals: "الموافقات غير متاحة",
      },
      accessibility: {
        group: "حالة المشروع",
        panelStatus: "{{panel}}: {{status}}",
      },
      tones: {
        workingNormally: "يعمل بشكل طبيعي",
        needsAttention: "يحتاج إلى الانتباه",
        unavailable: "غير متاح",
        checking: "جارٍ التحقق",
      },
    },
    palette: {
      commandCount_few: "{{count, number}} أوامر",
      commandCount_many: "{{count, number}} أمرًا",
      commandCount_one: "{{count, number}} أمر",
      commandCount_other: "{{count, number}} أمر",
      commandCount_two: "{{count, number}} أمران",
      commandCount_zero: "{{count, number}} أمر",
    },
    disabledReasons: {
      ...en.common.disabledReasons,
      ...rtlCS.disabledReasons,
      itemUnavailableOnCanvas: "حدّث البيانات، ثم حاول إظهار هذا العنصر على اللوحة.",
    },
    feedback: {
      actionUnavailable: "تعذر إكمال الإجراء. أعد تحميل الصفحة وحاول مرة أخرى.",
      copyFailed: "تعذر النسخ. حاول مرة أخرى.",
      copySucceeded: "تم النسخ.",
    },
    destructiveActions: {
      discardChanges: "تجاهل التغييرات",
    },
    shortcutDialog: en.common.shortcutDialog,
    shortcutSettings: {
      conflict: "هذا الاختصار مخصص بالفعل لـ {{action}}. اختر اختصارًا آخر.",
      empty: "لا توجد اختصارات لوحة مفاتيح متاحة",
      recording: "اضغط على مفتاح…",
    },
    shortcutGroups: {
      general: "عام",
      graph: "الرسم البياني",
      navigation: "التنقل",
      window: "النافذة",
    },
    keycaps: {
      ...en.common.keycaps,
      arrowDown: "سهم للأسفل",
      arrowLeft: "سهم لليسار",
      arrowRight: "سهم لليمين",
      arrowUp: "سهم للأعلى",
      backspace: "مسح للخلف",
      delete: "حذف",
      enter: "إدخال",
      escape: "خروج",
      shift: "تبديل",
      space: "مسافة",
    },
    statuses: en.common.statuses,
  },
  documents: {
    ...en.documents,
    ...rtlDS,
    localizationWave: rtlVW,
    accessibility: {
      addDocumentToFeature: "إضافة مستند إلى ميزة",
      browserView: "عرض المتصفح",
      decisionAccepted: "القرار مقبول",
      decisionDeprecated: "تم سحب القرار",
      decisionProposed: "القرار مقترح",
      decisionRejected: "القرار مرفوض",
      decisionSuperseded: "تم استبدال القرار",
      planComplete: "الخطة مكتملة",
      planInProgress: "الخطة قيد التنفيذ",
      planNotStarted: "لم تبدأ الخطة",
      treeBrowser: "شجرة المستندات",
      switchReadingAndEditingShortcut: "التبديل بين القراءة والتحرير ({{accelerator}})",
      treeOptionsSortedByLatestActivity: "خيارات شجرة المستندات، مرتبة حسب أحدث نشاط",
      treeOptionsSortedByDocumentCount:
        "خيارات شجرة المستندات، مرتبة حسب عدد المستندات",
      treeOptionsSortedByName: "خيارات شجرة المستندات، مرتبة حسب الاسم",
      treeOptionsSortedByCreationDate: "خيارات شجرة المستندات، مرتبة حسب تاريخ الإنشاء",
      treeOptionsSortedByEditDate: "خيارات شجرة المستندات، مرتبة حسب تاريخ التعديل",
      treeOptionsSortedByLength: "خيارات شجرة المستندات، مرتبة حسب الطول",
      treeOptionsSortedByWorkspaceShare:
        "خيارات شجرة المستندات، مرتبة حسب حصة مساحة العمل",
    },
    actions: {
      ...en.documents.actions,
      addComment: "إضافة تعليق",
      browseDocuments: "تصفح المستندات",
      browseFiles: "تصفح الملفات",
      closeAllDocuments: "إغلاق جميع المستندات",
      closeDocument: "إغلاق المستند",
      closeOtherDocuments: "إغلاق المستندات الأخرى",
      closeActiveTab: "إغلاق علامة تبويب المستند النشط",
      collapseCategory: "طي الفئة",
      finishEditing: "إنهاء التحرير",
      findByName: "البحث عن مستند بالاسم…",
      expandCategory: "توسيع الفئة",
      keepDocumentOpen: "إبقاء المستند مفتوحًا",
      keepTabOpen: "إبقاء علامة التبويب مفتوحة",
      reloadDocument: "إعادة تحميل المستند",
      nextTab: "الانتقال إلى علامة تبويب المستند التالية",
      openComments: "فتح التعليقات",
      previousTab: "الانتقال إلى علامة تبويب المستند السابقة",
      resetSorting: "إعادة تعيين الترتيب",
      save: "حفظ المستند",
      sortByLatestActivity: "الترتيب حسب أحدث نشاط",
      sortByDocumentCount: "الترتيب حسب عدد المستندات",
      sortByName: "الترتيب حسب الاسم",
      sortByCreationDate: "الترتيب حسب تاريخ الإنشاء",
      sortByEditDate: "الترتيب حسب تاريخ التعديل",
      sortByLength: "الترتيب حسب الطول",
      sortByWorkspaceShare: "الترتيب حسب حصة مساحة العمل",
      showOrHideChanges: "إظهار التغييرات أو إخفاؤها",
      filterByDocumentType: "التصفية حسب نوع المستند هذا",
      switchReadingAndEditing: "التبديل بين القراءة والتحرير",
    },
    guardedActions: {
      ...rtlReviewStationGuardedActions,
      ...rtlCommentGuardedActions,
    },
    destructiveActions: {
      ...rtlReviewStationDestructiveActions,
      ...rtlCommentDestructiveActions,
    },
    browserModes: {
      documents: "المستندات",
      files: "الملفات",
    },
    categories: {
      code: "التعليمات البرمجية",
    },
    codeTree: {
      accessibility: {
        browser: "ملفات المشروع",
        linkedToMap: "معروض في خريطة المشروع",
      },
      errors: {
        childUnavailable: "تعذر تحميل هذا المجلد. حاول مرة أخرى.",
        unavailable: "تعذر تحميل ملفات المشروع. حاول مرة أخرى.",
      },
      states: {
        childLoading: "جارٍ تحميل المجلد…",
        degraded: "ملفات المشروع غير متاحة. تصفح المستندات بدلاً من ذلك.",
        empty: "لم يتم العثور على ملفات مشروع.",
        loading: "جارٍ تحميل ملفات المشروع…",
        truncated:
          "تم تحميل {{shown, number}} من أصل {{total, number}} من الملفات والمجلدات.",
        truncatedUnknown: "تتوفر ملفات ومجلدات إضافية هنا.",
      },
    },
    confirmations: {
      discardUnsavedChanges: {
        title: "تجاهل التغييرات غير المحفوظة؟",
        body: "ستفقد تغييرات المستند غير المحفوظة. لا يمكن التراجع عن هذا الإجراء.",
      },
    },
    createDialog: {
      accessibility: {
        addLinkedDocument: "إضافة مستند مرتبط",
        backToFeature: "الرجوع إلى الميزة",
        documentType: "نوع المستند",
        feature: "الميزة",
        linkedDocuments: "المستندات المرتبطة",
        pipelineCoverage: "تقدم سير العمل",
        removeLinkedDocument: "إزالة {{document}}",
        title: "العنوان",
      },
      actions: {
        back: "رجوع",
        continue: "متابعة",
        create: "إنشاء",
        creating: "جارٍ إنشاء المستند…",
      },
      descriptions: {
        documentStage:
          "اختر نوع مستند متاحًا. ستُضاف لك روابط إلى المستندات الحديثة ذات الصلة.",
        featureStage:
          "اختر الميزة التي ينتمي إليها هذا العمل، أو أدخل وسم ميزة جديدًا. تُضاف المستندات الجديدة إلى سير عمل الميزة.",
      },
      documentTypes: {
        adr: "سجل قرار",
        audit: "تدقيق",
        document: "مستند",
        exec: "سجل خطوة",
        plan: "خطة",
        reference: "مرجع",
        research: "بحث",
      },
      emptyStates: {
        createFeatureTag: "أدخل وسم ميزة جديدًا",
        noMatchingDocuments: "لا توجد مستندات مطابقة",
      },
      errors: {
        createFailed: "تعذر إنشاء المستند. حدّث التطبيق، ثم حاول مرة أخرى.",
        inFlight: "لا يزال هذا المستند قيد الإنشاء. انتظر لحظة، ثم حاول مرة أخرى.",
        pathCollision:
          "يوجد اليوم مستند من هذا النوع لهذه الميزة. اختر نوعًا آخر أو حاول مرة أخرى غدًا.",
        projectChanged:
          "تغيّر المشروع قبل إنشاء المستند. راجع اختياراتك، ثم حاول مرة أخرى.",
        scopeChanged: "تغيّر موقع المشروع. أعد فتح المشروع، ثم حاول مرة أخرى.",
      },
      hints: {
        adr: "تسجيل قرار",
        audit: "مراجعة العمل المكتمل أو بدء سير عمل",
        notAvailable: "نوع المستند هذا غير متاح بعد.",
        plan: "تخطيط العمل",
        reference: "ربط العمل بالتعليمات البرمجية الموجودة",
        requiresDecision: "أضف سجل قرار أولاً.",
        requiresResearchOrReference: "أضف مستند بحث أو مرجع أولاً.",
        research: "استكشاف المشكلة",
      },
      labels: {
        documentType: "نوع المستند",
        feature: "الميزة",
        inThisFeature: "في هذه الميزة",
        linkedDocuments: "المستندات المرتبطة",
        title: "العنوان",
      },
      placeholders: {
        addLinkedDocument: "إضافة مستند مرتبط",
        documentTitle: "أدخل عنوان مستند",
        featureTag: "أدخل وسم ميزة",
      },
      stages: {
        document: "الخطوة 2 من 2: إضافة مستند",
        feature: "الخطوة 1 من 2: الإضافة إلى ميزة",
      },
      states: {
        checkingCoverage: "جارٍ التحقق من تقدم الميزة…",
        chooseFeatureForCoverage: "اختر ميزة أو أدخلها لرؤية تقدمها.",
        coverageUnavailable:
          "تقدم المشروع غير متاح. حدّث بيانات المشروع، ثم حاول مرة أخرى.",
        emptyFeature: "لا توجد مستندات بعد. أضف مستند بحث أو مرجع لبدء هذه الميزة.",
        nextStep: "الخطوة التالية",
        notYet: "ليس بعد",
        present: "موجود",
        selected: "محدد",
      },
      titles: {
        document: "إضافة مستند",
        feature: "الإضافة إلى ميزة",
      },
      validation: {
        chooseAvailableDocumentType: "اختر نوع مستند متاحًا.",
        chooseDocumentType: "اختر نوع مستند.",
        chooseFeature: "اختر ميزة أو أدخلها.",
        completeRequiredFields: "أدخل ميزة وعنوانًا.",
        requiresDecision: "أضف سجل قرار أولاً.",
        requiresResearchOrReference: "أضف مستند بحث أو مرجع أولاً.",
      },
    },
    documentTypes: {
      research: "البحث",
      adr: "القرارات",
      plan: "الخطط",
      exec: "الخطوات",
      audit: "عمليات التدقيق",
      reference: "المراجع",
    },
    editor: {
      accessibility: {
        formattingToolbar: "التنسيق",
      },
      actions: {
        bold: "تطبيق الخط العريض",
        italic: "تطبيق الخط المائل",
        inlineCode: "تطبيق التعليمات البرمجية المضمنة",
        heading: "إضافة عنوان",
        bulletedList: "إضافة قائمة نقطية",
        numberedList: "إضافة قائمة مرقمة",
        quote: "إضافة اقتباس",
        link: "إضافة رابط",
        linkToDocument: "إضافة رابط إلى مستند",
      },
    },
    documentSearch: rtlDocumentSearchResources,
    reviewStation: rtlReviewStationResources,
    viewer: {
      languages: rtlLanguageDisplayResources,
      accessibility: {
        documentMode: "وضع المستند",
        documentProperties: "خصائص المستند",
        featureTag: "وسم الميزة",
      },
      modes: {
        edit: "تحرير",
        view: "قراءة",
      },
      codeViewer: rtlCodeViewerResources,
      reader: rtlDocumentViewerReaderResources,
      comments: rtlCommentResources,
      properties: rtlDocumentPropertiesResources,
    },
    disabledReasons: {
      ...en.documents.disabledReasons,
      chooseTemporaryTab: "اختر علامة تبويب مؤقتة لإبقائها مفتوحة.",
      copyChangesBeforeReopening: "انسخ تغييراتك، ثم أعد فتح المستند قبل الحفظ.",
      openForEditing: "افتح مستندًا لتحريره.",
      openDocument: "افتح مستندًا أولاً.",
      openAnotherDocument: "افتح مستندًا آخر، ثم حاول مرة أخرى.",
      tryAfterSaving: "حاول مرة أخرى بعد اكتمال الحفظ.",
      updateBeforeSaving: "حدّث المستند قبل الحفظ.",
    },
    feedback: {
      alreadyLinked: "هذه المستندات مرتبطة بالفعل.",
      linkConflict: "تغير المستند قبل ربطه. افتحه، ثم حاول مرة أخرى.",
      linkFailed: "تعذر ربط المستندات. حاول مرة أخرى.",
      linkInProgress: "جارٍ ربط المستندات…",
      linkSucceeded: "تم ربط المستندات.",
    },
    tree: {
      created: "تم الإنشاء في {{date}}",
      decisionStatusAccepted: "مقبول",
      decisionStatusDeprecated: "مسحوب",
      decisionStatusProposed: "مقترح",
      decisionStatusRejected: "مرفوض",
      decisionStatusSuperseded: "مستبدل",
      degraded: "بعض المستندات غير متاحة مؤقتًا.",
      lastEdited: "آخر تعديل في {{date}}",
      emptyWorktree: "لا توجد مستندات في شجرة العمل هذه حتى الآن.",
      loading: "جارٍ تحميل المستندات…",
      noFilterMatches: "لا توجد مستندات تطابق هذا الفلتر.",
      noFilterMatchesYet: "لا توجد نتائج حتى الآن. ما زال تحميل القائمة جاريًا.",
      partialAnnouncement: "جارٍ تحميل المستندات المتبقية.",
      partialCount_one:
        "جارٍ تحميل القائمة الكاملة. يتوفر {{count, number}} مستند حتى الآن.",
      partialCount_zero:
        "جارٍ تحميل القائمة الكاملة. يتوفر {{count, number}} مستند حتى الآن.",
      partialCount_two:
        "جارٍ تحميل القائمة الكاملة. يتوفر {{count, number}} مستندان حتى الآن.",
      partialCount_few:
        "جارٍ تحميل القائمة الكاملة. تتوفر {{count, number}} مستندات حتى الآن.",
      partialCount_many:
        "جارٍ تحميل القائمة الكاملة. يتوفر {{count, number}} مستندًا حتى الآن.",
      partialCount_other:
        "جارٍ تحميل القائمة الكاملة. يتوفر {{count, number}} مستند حتى الآن.",
      planProgress: "اكتمل {{done, number}} من {{total, number}}",
      sizeSummary_one: "{{count, number}} كلمة، {{size}}",
      sizeSummary_zero: "{{count, number}} كلمة، {{size}}",
      sizeSummary_two: "{{count, number}} كلمتان، {{size}}",
      sizeSummary_few: "{{count, number}} كلمات، {{size}}",
      sizeSummary_many: "{{count, number}} كلمة، {{size}}",
      sizeSummary_other: "{{count, number}} كلمة، {{size}}",
      unavailable: "المستندات غير متاحة. حدّث التطبيق، ثم حاول مرة أخرى.",
      updated: "تاريخ التحديث {{date}}",
      vaultBrowser: "متصفح الخزنة",
      wordCount_one: "{{count, number}} كلمة",
      wordCount_zero: "{{count, number}} كلمة",
      wordCount_two: "{{count, number}} كلمتان",
      wordCount_few: "{{count, number}} كلمات",
      wordCount_many: "{{count, number}} كلمة",
      wordCount_other: "{{count, number}} كلمة",
      weightBelowThreshold: "أقل من {{threshold}}",
    },
    labels: {
      document: "مستند",
      vault: "الخزنة",
    },
    sortOptions: {
      latestActivity: "أحدث نشاط",
      documentCount: "عدد المستندات",
      name: "الاسم",
      creationDate: "تاريخ الإنشاء",
      editDate: "تاريخ التعديل",
      length: "الطول",
      workspaceShare: "حصة مساحة العمل",
    },
    shortcutGroups: {
      documents: "المستندات",
      editing: "تحرير المستند",
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
  features: {
    ...en.features,
    actions: {
      collapse: "طي الميزة",
      expand: "توسيع الميزة",
      moveToNextFeature: "الانتقال إلى الميزة التالية",
      moveToPreviousFeature: "الانتقال إلى الميزة السابقة",
      filterByFeature: "التصفية حسب هذه الميزة",
    },
    feedback: {
      archiveRejected: "لم تتم أرشفة الميزة. تحقق منها، ثم حاول مرة أخرى.",
      archiveSucceeded: "تمت أرشفة الميزة.",
      archiveUnavailable: "تعذرت أرشفة الميزة. حاول مرة أخرى.",
      repairRejected: "لم يتم إصلاح الميزة. تحقق منها، ثم حاول مرة أخرى.",
      repairSucceeded: "تم إصلاح الميزة.",
      repairUnavailable: "تعذر إصلاح الميزة. حاول مرة أخرى.",
    },
    labels: {
      feature: "الميزات",
    },
  },
  graph: rtlGraphResources,
  operations: {
    ...en.operations,
    searchMaintenance: rtlSearchMaintenanceResources,
    actions: {
      applySearchSettings: "تطبيق إعدادات البحث",
      checkVault: "فحص الخزنة",
      checkWorkspace: "فحص مساحة العمل",
      disableSearch: "تعطيل البحث",
      enableSearch: "تمكين البحث",
      refreshSearch: "تحديث البحث",
      showWorkspaceDetails: "عرض تفاصيل مساحة العمل",
    },
    feedback: {
      applySearchSettings: {
        failed: "تعذر تطبيق إعدادات البحث. حاول مرة أخرى.",
        running: "جارٍ تطبيق إعدادات البحث…",
        succeeded: "تم تطبيق إعدادات البحث.",
        unavailable: "البحث غير متاح. مكّن البحث، ثم حاول مرة أخرى.",
      },
      checkWorkspace: {
        failed: "تعذر فحص مساحة العمل. حاول مرة أخرى.",
        running: "جارٍ فحص مساحة العمل…",
        succeeded: "اكتمل فحص مساحة العمل.",
      },
      disableSearch: {
        failed: "تعذر تعطيل البحث. حاول مرة أخرى.",
        running: "جارٍ تعطيل البحث…",
        succeeded: "تم تعطيل البحث.",
      },
      enableSearch: {
        failed: "تعذر تمكين البحث. حاول مرة أخرى.",
        running: "جارٍ تمكين البحث…",
        succeeded: "تم تمكين البحث.",
        unavailable: "لا يزال البحث غير متاح. حاول مرة أخرى.",
      },
      refreshSearch: {
        failed: "تعذر تحديث البحث. حاول مرة أخرى.",
        running: "جارٍ تحديث البحث…",
        succeeded: "بدأ تحديث البحث.",
        unavailable: "البحث غير متاح. مكّن البحث، ثم حاول مرة أخرى.",
      },
      showWorkspaceDetails: {
        failed: "تعذر تحميل تفاصيل مساحة العمل. حاول مرة أخرى.",
        running: "جارٍ تحميل تفاصيل مساحة العمل…",
        succeeded: "تم تحميل تفاصيل مساحة العمل.",
      },
    },
  },
  projects: {
    workspaceIdentity: rtlWorkspaceIdentityResources,
    addDialog: rtlAddProjectDialogResources,
    actions: {
      add: "إضافة مشروع…",
      checkProjectStatus: "التحقق من حالة المشروع",
      clearHistory: "مسح سجل المشاريع",
      openPullRequest: "فتح طلب الدمج",
      prepareProjectTools: "إعداد أدوات المشروع",
      setUpProject: "إعداد المشروع",
      switch: "تبديل المشروع…",
      switchWorktree: "التبديل إلى شجرة العمل",
      updateProject: "تحديث المشروع",
      updateProjectTools: "تحديث أدوات المشروع",
    },
    confirmations: {
      replaceSetup: {
        body: "يستبدل هذا ملفات الإعداد الحالية وقد يستبدل تغييراتك. احفظ نسخة احتياطية قبل المتابعة.",
        title: "استبدال إعداد المشروع؟",
      },
    },
    destructiveActions: {
      replaceSetup: "استبدال إعداد المشروع",
    },
    disabledReasons: {
      chooseWorktreeWithProjectFiles: "اختر شجرة عمل أخرى تحتوي على ملفات المشروع.",
      installRequiredProjectTools: "ثبّت أدوات المشروع المطلوبة، ثم حاول مرة أخرى.",
      noSetupChangesNeeded: "ارجع إلى المشروع للمتابعة.",
      prepareFolderAsGitProject: "جهّز هذا المجلد كمشروع Git، ثم حاول مرة أخرى.",
      refreshProjectForPullRequest: "حدّث بيانات المشروع، ثم حاول مرة أخرى.",
      setUpProjectFirst: "أعدّ المشروع، ثم حاول مرة أخرى.",
      waitForProjectStatus: "انتظر حتى يتم تحميل حالة المشروع، ثم حاول مرة أخرى.",
    },
    folderBrowser: rtlFolderBrowserResources,
    placesRail: rtlPlacesRailResources,
    provisioning: {
      description: "أعدّ هذا المشروع للمتابعة.",
      details: {
        installRequiredProjectTools: "ثبّت أدوات المشروع المطلوبة، ثم حاول مرة أخرى.",
        prepareFolderAsGitProject: "جهّز هذا المجلد كمشروع Git، ثم حاول مرة أخرى.",
      },
      progress: "جارٍ إعداد المشروع…",
      result: {
        completed: "اكتمل إعداد المشروع",
        failed: "فشل إعداد المشروع",
        indeterminate:
          "قد يكون الإعداد لا يزال قيد التنفيذ. تحقق من حالة المشروع قبل المحاولة مرة أخرى.",
        itemCount_zero: "{{count, number}} عنصر",
        itemCount_one: "{{count, number}} عنصر",
        itemCount_two: "{{count, number}} عنصران",
        itemCount_few: "{{count, number}} عناصر",
        itemCount_many: "{{count, number}} عنصرًا",
        itemCount_other: "{{count, number}} عنصر",
        status: {
          created: "تم الإنشاء",
          failed: "فشل",
          mixed: "نتائج متنوعة",
          removed: "تمت الإزالة",
          restored: "تمت الاستعادة",
          skipped: "تم التجاوز",
          updated: "تم التحديث",
          upToDate: "محدّث بالفعل",
        },
      },
      startFailed: "تعذر بدء إعداد المشروع. حاول مرة أخرى.",
      statusUnavailable: "حالة المشروع غير متاحة",
      title: "إعداد المشروع مطلوب",
    },
    shortcutGroups: {
      projects: "المشاريع",
    },
  },
  settings: {
    actions: {
      useDarkTheme: "استخدام النسق الداكن",
      useHighContrastTheme: "استخدام نسق عالي التباين",
      useLightTheme: "استخدام النسق الفاتح",
      useSystemTheme: "استخدام نسق النظام",
    },
    groups: {
      appearance: "المظهر",
      graph: "الرسم البياني",
      keybindings: "اختصارات لوحة المفاتيح",
    },
    fields: {
      theme: { label: "النسق", description: "اختر نسق الواجهة." },
      reduceMotion: {
        label: "تقليل الحركة",
        description: "استخدم رسومًا متحركة أقل في الواجهة.",
      },
      activitySectionFolds: {
        label: "أقسام النشاط",
        description: "تذكر أقسام النشاط المفتوحة.",
      },
      language: { label: "اللغة", description: "اختر لغة الواجهة." },
      defaultGranularity: {
        label: "التفصيل الافتراضي",
        description: "اختر مستوى التفاصيل الأولي للرسم البياني.",
      },
      corpus: { label: "محتوى الرسم", description: "اختر المحتوى الذي يظهر في الرسم." },
      timelineDate: {
        label: "تاريخ المخطط الزمني",
        description: "اختر التاريخ الذي يتحكم في المخطط.",
      },
      confidenceFloor: {
        label: "الحد الأدنى ليقين الاتصال",
        description: "أخفِ الاتصالات دون هذا اليقين.",
      },
      labelFilter: {
        label: "تصفية الاسم",
        description: "اعرض العناصر ذات الأسماء المطابقة.",
        placeholder: "تصفية حسب الاسم",
      },
      graphControls: { label: "عناصر تحكم الرسم", description: "خصص التنقل في الرسم." },
      shortcuts: {
        label: "اختصارات لوحة المفاتيح",
        description: "خصص أوامر لوحة المفاتيح.",
      },
    },
    options: {
      system: "النظام",
      light: "فاتح",
      dark: "داكن",
      highContrast: "تباين عالٍ",
      english: "الإنجليزية",
    },
  },
  timeline: rtlTimelineResources,
} as const;

export const testResources = {
  [sourceLocale]: en,
  [ltrTestLocale]: ltrTestResources,
  [rtlTestLocale]: rtlTestResources,
} as const;

export type TestLocale = keyof typeof testResources;
