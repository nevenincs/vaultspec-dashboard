import {
  useCallback,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import type { i18n } from "i18next";
import { I18nextProvider, useTranslation } from "react-i18next";

import { defaultNS } from "../../locales/en";
import {
  resolveMessage,
  resolveMessageResult,
  type MessageResolutionResult,
} from "./fallback";
import type { AnyMessageDescriptor } from "./message";
import { localization, localizationNamespaces } from "./runtime";

const LOCALIZATION_HOOK_OPTIONS = Object.freeze({ useSuspense: false });

// Dev-only e2e verification lever (W06.P19.S105/S138): a bounded escape hatch
// that swaps the bound runtime instance so a real browser render exercises
// expanded-copy/right-to-left behavior against the PRODUCTION component tree —
// never a separate mock tree, never faked DOM. Every normal boot (production
// AND ordinary dev sessions) resolves to the one application-lifetime
// `localization` singleton below; the swap surface is entirely inert unless a
// dev-only caller invokes `setActiveLocalizationInstance` (see main.tsx's
// `__localizationControls`, consumed only by localization-layout.spec.ts /
// localization-errors.spec.ts under playwright.localization.config.ts).
let activeLocalizationInstance: i18n = localization;
const activeInstanceListeners = new Set<() => void>();

function subscribeActiveInstance(listener: () => void): () => void {
  activeInstanceListeners.add(listener);
  return () => {
    activeInstanceListeners.delete(listener);
  };
}

function getActiveInstance(): i18n {
  return activeLocalizationInstance;
}

/** Dev-only: swap the runtime instance every `LocalizationProvider` binds to. */
export function setActiveLocalizationInstance(instance: i18n): void {
  activeLocalizationInstance = instance;
  for (const listener of activeInstanceListeners) {
    listener();
  }
}

export interface LocalizationProviderProps {
  readonly children: ReactNode;
}

/** Bind React to the application-lifetime localization runtime. */
export function LocalizationProvider({
  children,
}: LocalizationProviderProps): ReactElement {
  const instance = useSyncExternalStore(
    subscribeActiveInstance,
    getActiveInstance,
    getActiveInstance,
  );
  return (
    <I18nextProvider i18n={instance} defaultNS={defaultNS}>
      {children}
    </I18nextProvider>
  );
}

/** Resolve a bounded message descriptor and update when the active language changes. */
export function useLocalizedMessage(descriptor: unknown): string {
  const { i18n } = useTranslation(localizationNamespaces, LOCALIZATION_HOOK_OPTIONS);

  return resolveMessage(i18n, descriptor);
}

export type LocalizedMessageResolver = (
  descriptor: AnyMessageDescriptor,
) => MessageResolutionResult;

/** Resolve many typed descriptors while remaining reactive to language changes. */
export function useLocalizedMessageResolver(): LocalizedMessageResolver {
  const { i18n } = useTranslation(localizationNamespaces, LOCALIZATION_HOOK_OPTIONS);
  const language = i18n.resolvedLanguage ?? i18n.language;

  return useCallback(
    (descriptor: AnyMessageDescriptor) => resolveMessageResult(i18n, descriptor),
    [i18n, language],
  );
}

/** Return the active locale and update when the application language changes. */
export function useActiveLocale(): string {
  const { i18n } = useTranslation(localizationNamespaces, LOCALIZATION_HOOK_OPTIONS);
  return i18n.resolvedLanguage ?? i18n.language;
}
