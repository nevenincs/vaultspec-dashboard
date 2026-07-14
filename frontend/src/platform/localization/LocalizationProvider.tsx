import { useCallback, type ReactElement, type ReactNode } from "react";
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

export interface LocalizationProviderProps {
  readonly children: ReactNode;
}

/** Bind React to the application-lifetime localization runtime. */
export function LocalizationProvider({
  children,
}: LocalizationProviderProps): ReactElement {
  return (
    <I18nextProvider i18n={localization} defaultNS={defaultNS}>
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
