// RelatedDocPicker — the editor's "link to existing documents" control
// (document-editor-redesign ADR). It replaces the freeform comma-separated
// `related` text field: the author searches the live vault corpus and picks
// documents, each shown as a removable token, so a link can only ever point at a
// document that actually exists (no dangling wiki-links from a typo). It composes
// the shared AutocompleteCombobox and the kit Badge/IconButton — no ad-hoc field.
//
// The editor's frontmatter draft keeps `related` as a comma-joined stem string
// (the existing store shape); this component is the pure UI over that string —
// `parseRelatedStems` / `serializeRelatedStems` bridge the two and are exported for
// unit tests.

import { X } from "lucide-react";

import { Badge } from "../kit";
import type { EditorCorpusDocument } from "../../stores/server/queries";
import { AutocompleteCombobox, type ComboOption } from "./AutocompleteCombobox";

/** Parse the `related` draft string into a de-duplicated ordered list of stems,
 *  tolerating stray `[[ ]]` wrapping and whitespace. */
export function parseRelatedStems(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(",")) {
    const stem = raw.trim().replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
    if (stem.length > 0 && !seen.has(stem)) {
      seen.add(stem);
      out.push(stem);
    }
  }
  return out;
}

/** Serialize a stem list back to the comma-joined draft string. */
export function serializeRelatedStems(stems: readonly string[]): string {
  return stems.join(", ");
}

export function RelatedDocPicker({
  related,
  onChange,
  corpus,
  selfStem,
}: {
  /** The current `related` draft (comma-joined stems). */
  related: string;
  /** Emits the next `related` draft string. */
  onChange: (next: string) => void;
  /** The pickable document corpus (from the stores link corpus selector). */
  corpus: readonly EditorCorpusDocument[];
  /** The stem of the document being edited, excluded from its own link options. */
  selfStem: string;
}) {
  const selected = parseRelatedStems(related);
  const selectedSet = new Set(selected);

  const options: ComboOption[] = corpus
    .filter((doc) => doc.stem !== selfStem && !selectedSet.has(doc.stem))
    .map((doc) => ({
      value: doc.stem,
      primary: doc.title,
      secondary: doc.stem,
      docType: doc.feature ?? undefined,
    }));

  const add = (stem: string) => onChange(serializeRelatedStems([...selected, stem]));
  const remove = (stem: string) =>
    onChange(serializeRelatedStems(selected.filter((s) => s !== stem)));

  return (
    <div className="flex flex-col gap-fg-2" data-related-picker>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-fg-1" aria-label="linked documents">
          {selected.map((stem) => (
            <li key={stem}>
              <Badge>
                <span className="truncate">{stem}</span>
                <button
                  type="button"
                  onClick={() => remove(stem)}
                  aria-label={`remove ${stem}`}
                  className="ml-fg-1 inline-flex shrink-0 rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                >
                  <X size={12} aria-hidden />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <AutocompleteCombobox
        options={options}
        onCommit={add}
        placeholder="Link a document…"
        ariaLabel="link a related document"
        clearOnCommit
        emptyLabel="No matching documents"
      />
    </div>
  );
}
