import type { i18n } from "i18next";

import { sourceLocale } from "../../locales/en";
import { localization } from "./runtime";

const MAX_LOCALE_LENGTH = 128;
const LISTENER_REMOVAL_ATTEMPTS = 2;
const INTERNAL_LANGUAGES = new Set(["cimode", "dev"]);

type DocumentLanguageRoot = Pick<HTMLElement, "dir" | "lang">;

interface DocumentLanguageBinding {
  readonly listener: () => void;
  references: number;
}

const bindings = new WeakMap<
  i18n,
  WeakMap<DocumentLanguageRoot, DocumentLanguageBinding>
>();

function canonicalLocale(candidate: unknown): string | null {
  if (
    typeof candidate !== "string" ||
    candidate.length === 0 ||
    candidate.length > MAX_LOCALE_LENGTH ||
    candidate.trim() !== candidate ||
    INTERNAL_LANGUAGES.has(candidate.toLowerCase())
  ) {
    return null;
  }

  try {
    const locales = Intl.getCanonicalLocales(candidate);
    const locale = locales.length === 1 ? locales[0] : undefined;

    if (
      locale === undefined ||
      locale.length > MAX_LOCALE_LENGTH ||
      INTERNAL_LANGUAGES.has(locale.toLowerCase())
    ) {
      return null;
    }

    return locale;
  } catch {
    return null;
  }
}

function resolveLocale(instance: i18n): string {
  return (
    canonicalLocale(instance.resolvedLanguage) ??
    canonicalLocale(instance.language) ??
    sourceLocale
  );
}

function resolveDirection(instance: i18n, locale: string): "ltr" | "rtl" {
  try {
    return instance.dir(locale) === "rtl" ? "rtl" : "ltr";
  } catch {
    try {
      return instance.dir(sourceLocale) === "rtl" ? "rtl" : "ltr";
    } catch {
      return "ltr";
    }
  }
}

function documentRoot(): DocumentLanguageRoot | null {
  try {
    return document.documentElement;
  } catch {
    return null;
  }
}

function removeLanguageListener(instance: i18n, listener: () => void): boolean {
  for (let attempt = 0; attempt < LISTENER_REMOVAL_ATTEMPTS; attempt += 1) {
    try {
      instance.off("languageChanged", listener);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

/** Apply the runtime language and writing direction to a document root. */
export function applyDocumentLanguage(
  instance: i18n = localization,
  root: DocumentLanguageRoot | null = documentRoot(),
): boolean {
  if (root === null) {
    return false;
  }

  try {
    const locale = resolveLocale(instance);
    const direction = resolveDirection(instance, locale);

    if (root.lang !== locale) {
      root.lang = locale;
    }
    if (root.dir !== direction) {
      root.dir = direction;
    }
    return true;
  } catch {
    return false;
  }
}

/** Keep the document language synchronized with the application runtime. */
export function bindDocumentLanguage(
  instance: i18n = localization,
  root: DocumentLanguageRoot | null = documentRoot(),
): () => void {
  if (root === null) {
    return () => undefined;
  }

  applyDocumentLanguage(instance, root);

  let bindingsForRoot = bindings.get(instance);
  if (bindingsForRoot === undefined) {
    bindingsForRoot = new WeakMap();
    bindings.set(instance, bindingsForRoot);
  }

  let binding = bindingsForRoot.get(root);
  if (binding === undefined) {
    const listener = (): void => {
      applyDocumentLanguage(instance, root);
    };
    binding = { listener, references: 0 };

    try {
      instance.on("languageChanged", listener);
    } catch {
      return () => undefined;
    }

    bindingsForRoot.set(root, binding);
  }

  if (
    !Number.isSafeInteger(binding.references) ||
    binding.references >= Number.MAX_SAFE_INTEGER
  ) {
    return () => undefined;
  }

  binding.references += 1;
  let finished = false;
  let releasedReference = false;

  return (): void => {
    if (finished) {
      return;
    }

    const currentBinding = bindingsForRoot.get(root);
    if (currentBinding !== binding) {
      finished = true;
      return;
    }

    if (!releasedReference) {
      currentBinding.references -= 1;
      releasedReference = true;
    }

    if (currentBinding.references > 0) {
      finished = true;
      return;
    }

    if (!removeLanguageListener(instance, currentBinding.listener)) {
      return;
    }

    if (
      bindingsForRoot.get(root) === currentBinding &&
      currentBinding.references === 0
    ) {
      bindingsForRoot.delete(root);
    }
    finished = true;
  };
}
