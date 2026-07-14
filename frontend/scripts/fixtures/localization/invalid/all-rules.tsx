import { useTranslation as useLocale } from "react-i18next";

import { createConfirmationDescriptor as describeConfirmation } from "../../../../src/platform/localization/message";

const CONDITIONAL_COPY = "Choose another item";
const FIXED_LOCALE = "en-US";

export function InvalidLocalizationRules(props: {
  readonly locale: string;
  readonly messageKey: string;
  readonly overrideMessageKey: string;
  readonly ready: boolean;
}) {
  const { t: translate } = useLocale();
  const presentation = { title: "Recent activity" };
  const dynamicMessage = translate(props.messageKey);
  const defaultedMessage = translate("common:actions.retry", {
    defaultValue: "Try this operation again",
  });
  const translatedFragment = `${translate("common:actions.close")} now`;
  const conditionalMessage = props.ready
    ? translate("common:actions.retry")
    : CONDITIONAL_COPY;
  const fixedNumber = new Intl.NumberFormat(FIXED_LOCALE).format(42);
  const directDate = Intl.DateTimeFormat(props.locale).format(new Date(0));
  const dynamicBody = { key: props.messageKey };
  const cancelLabel = { key: "common:actions.cancel" } as const;
  const confirmLabel = {
    key: "common:destructiveActions.discardChanges",
  } as const;
  const title = { key: "errors:unexpectedApplication.title" } as const;
  describeConfirmation({ body: dynamicBody, cancelLabel, confirmLabel, title });
  const staticConfirmationFields = {
    body: { key: "errors:unexpectedApplication.message" } as const,
    cancelLabel,
    confirmLabel,
    title,
  };
  const laterDynamicBody = { key: props.overrideMessageKey };
  describeConfirmation({
    ...staticConfirmationFields,
    body: laterDynamicBody,
  });
  const rawConfirmationFields = {
    body: "Raw confirmation body",
    cancelLabel,
    confirmLabel,
    title,
  };
  describeConfirmation({ ...rawConfirmationFields });
  const cyclicConfirmation = { ...cyclicConfirmationTail };
  const cyclicConfirmationTail = { ...cyclicConfirmation };
  void cyclicConfirmationTail;
  describeConfirmation(cyclicConfirmation);
  alert("This action could not be completed");

  return (
    <section aria-label="Activity controls">
      Untranslated fixture copy
      {conditionalMessage}
      {translatedFragment}
      {dynamicMessage}
      {defaultedMessage}
      {presentation.title}
      {fixedNumber}
      {directDate}
    </section>
  );
}
