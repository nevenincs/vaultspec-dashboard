import type { ReactElement, ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

import { defaultNS } from "../../locales/en";
import { resolveMessage } from "./fallback";
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
