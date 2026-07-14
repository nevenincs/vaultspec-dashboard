import i18next, { t as directTranslate } from "i18next";
import * as ReactLocalization from "react-i18next";
import { useTranslation as useLocale } from "react-i18next";

import {
  createConfirmationDescriptor as describeConfirmation,
  createMessageDescriptor as describeMessage,
} from "../../../../src/platform/localization/message";
import * as LocalizationRuntime from "../../../../src/platform/localization/runtime";

export function ValidTranslationBindings(props: { readonly dynamicKey: string }) {
  const hookResult = useLocale();
  const { t: translate, i18n: boundRuntime } = useLocale();
  const namespaceHook = ReactLocalization.useTranslation();
  const localRuntime = LocalizationRuntime.createLocalizationRuntime();
  const message = describeMessage("common:actions.retry");
  const body = { key: "errors:unexpectedApplication.message" } as const;
  const cancelLabel = { key: "common:actions.cancel" } as const;
  const confirmLabel = {
    key: "common:destructiveActions.discardChanges",
  } as const;
  const title = { key: "errors:unexpectedApplication.title" } as const;
  const shorthandConfirmation = describeConfirmation({
    body,
    cancelLabel,
    confirmLabel,
    title,
  });
  const confirmationFields = { body, cancelLabel, confirmLabel, title };
  const spreadConfirmation = describeConfirmation({ ...confirmationFields });
  const dynamicFirstFields = {
    ...confirmationFields,
    body: { key: props.dynamicKey },
  };
  const staticOverrideConfirmation = describeConfirmation({
    ...dynamicFirstFields,
    body,
  });

  return (
    <>
      {translate("common:actions.retry")}
      {boundRuntime.t("common:actions.close")}
      {hookResult.t("common:actions.cancel")}
      {namespaceHook.i18n.t("common:actions.reloadPage")}
      {localRuntime.t("errors:unexpectedSection.title")}
      {i18next.t("errors:unexpectedApplication.title")}
      {directTranslate("errors:unexpectedSection.message")}
      {message?.key}
      {shorthandConfirmation?.cancelLabel.key}
      {spreadConfirmation?.confirmLabel.key}
      {staticOverrideConfirmation?.body.key}
    </>
  );
}

export function UnrelatedSameNameBindings() {
  const t = (key: string, options?: { defaultValue: string }) =>
    `${key}:${options?.defaultValue ?? ""}`;
  const i18n = { t };
  const createMessageDescriptor = t;

  return (
    <>
      {t("plain-key", { defaultValue: "Tooling fallback" })}
      {i18n.t("plain-key", { defaultValue: "Receiver fallback" })}
      {createMessageDescriptor("plain-key", { defaultValue: "Factory fallback" })}
    </>
  );
}
