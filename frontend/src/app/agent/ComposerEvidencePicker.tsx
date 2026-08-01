// The `@`-evidence picker (agent-panel-shell-integration D3; plan P06.S21). Typing
// `@` in the composer opens this over the input; it rides the EXISTING search-
// provider seam rather than adding a search of its own.
//
// Scoping is the load-bearing detail: both providers take `(query, scope)` and the
// scope passed here is the SERVED active scope — the same root the run-start
// generation fence checks — so the picker can only ever offer evidence from the
// workspace the run will bind to. With no resolved scope the providers are idle by
// their own contract, so the picker offers nothing rather than reaching across
// workspaces.
//
// Layer ownership: dumb app chrome. The two provider hooks are the stores layer's;
// the merge/dedupe/cap is the pure `composerEvidence` half; the accepted path
// becomes a chip on the existing `agentComposer` store under its existing cap.

import { useState, type RefObject } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { useActiveScope } from "../../stores/server/queries";
import {
  useFilesCodeProvider,
  useFilesVaultProvider,
} from "../../stores/server/searchProviders";
import { useAgentComposer, useAgentMentions } from "../../stores/view/agentComposer";
import { AutocompleteCombobox, type ComboOption } from "../viewer/AutocompleteCombobox";
import { Popover } from "../kit";
import { evidenceMention, evidenceOptions } from "./composerEvidence";

const MSG = {
  aria: "common:agent.composer.evidenceAria",
  placeholder: "common:agent.composer.evidencePlaceholder",
  empty: "common:agent.composer.evidenceEmpty",
} as const;

export function ComposerEvidencePicker({
  onDismiss,
  inputRef,
}: {
  onDismiss: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const scope = useActiveScope();
  const mentions = useAgentMentions();
  // The typed query drives BOTH providers. They are hook-shaped over `(query,
  // scope)` and idle on an empty query, so an unopened or untouched picker issues
  // no listing work at all.
  const [query, setQuery] = useState("");
  const filesVault = useFilesVaultProvider(query, scope);
  const filesCode = useFilesCodeProvider(query, scope);

  // Vault first, so a hit that is both a document and a file keeps its document
  // identity — the same precedence the unified search host uses.
  const options: ComboOption[] = evidenceOptions(
    [filesVault.entries, filesCode.entries],
    mentions,
  );

  const commit = (value: string) => {
    const path = value.trim();
    if (path.length > 0) useAgentComposer.getState().addMention(evidenceMention(path));
    onDismiss();
  };

  const aria = resolveMessage({ key: MSG.aria });
  const placeholder = resolveMessage({ key: MSG.placeholder });
  const empty = resolveMessage({ key: MSG.empty });
  if (aria.usedFallback || placeholder.usedFallback || empty.usedFallback) return null;

  return (
    <Popover
      open
      onDismiss={onDismiss}
      returnFocusRef={inputRef}
      role="dialog"
      aria-label={aria.message}
      className="absolute inset-x-0 bottom-full z-40 mb-fg-1 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
      data-composer-evidence
    >
      <AutocompleteCombobox
        options={options}
        onCommit={commit}
        onQueryChange={setQuery}
        autoFocus
        clearOnCommit
        placeholder={placeholder.message}
        ariaLabel={aria.message}
        emptyLabel={empty.message}
      />
    </Popover>
  );
}
