// The mid-run questionnaire (agent-panel-shell-integration D5; a2a-agent-flow D5):
// an IN-TRANSCRIPT card at the park point, never a modal, that is the sole answer
// surface while the run waits.
//
// Honesty note carried from the research, unchanged: no reference product exhibited
// this surface. It is designed from our own wire payload plus Claude's observed
// recap-card precedent, and its first live team run is a named review moment.
//
// Three contract details drive the shape:
//   - a `text` answer is a SINGLE-LINE input, never a textarea, because the engine
//     boundary refuses control characters in a bounded text field;
//   - `required` gates submit, and blank optional answers are omitted rather than
//     sent as empty strings;
//   - recovery is authoritative — the card renders from the `run-status`
//     `pending_clarification` disclosure, so a reload re-renders it from the wire
//     with no relay memory involved. The relay's `clarification-pending` frame only
//     forces the re-read.
//
// The C8 recap is deliberately NOT held here. This card's mount condition is the
// pending disclosure, and answering successfully invalidates run-status — whose
// refetch clears that disclosure and unmounts the card. A recap in local state would
// be destroyed by the very success it records. It is written to
// `stores/view/clarificationRecaps` instead, which outlives this component; see that
// module for the honest durability bar.
//
// Layer ownership: dumb app chrome over the run-progress context plus the one
// clarification mutation. It reads no raw `tiers` and holds no wire state.

import { useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { useRespondToClarification } from "../../stores/server/agent/a2aTeam";
import { recordClarificationRecap } from "../../stores/view/clarificationRecaps";
import { Button } from "../kit";
import {
  CLARIFICATION_MAX_ANSWER_CHARS,
  boundedAnswer,
  clarificationAnswerBody,
  clarificationAnswersComplete,
  clarificationRecap,
  type ClarificationDraft,
  type ClarificationRecapEntry,
  type PendingClarification,
} from "./clarification";

const MSG = {
  region: "common:agent.clarification.region",
  heading: "common:agent.clarification.title",
  submit: "common:agent.clarification.submit",
  required: "common:agent.clarification.required",
  answerPlaceholder: "common:agent.clarification.answerPlaceholder",
  failed: "common:agent.clarification.failed",
  recapTitle: "common:agent.clarification.recapTitle",
} as const;

/**
 * The C8 recap: a bordered question/answer card that stays in the transcript after
 * the run resumes. A decision the user made mid-run is provenance, not chat — so it
 * outlives the questionnaire that captured it.
 */
export function ClarificationRecap({
  entries,
}: {
  entries: readonly ClarificationRecapEntry[];
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const recapHeading = resolveMessage({ key: MSG.recapTitle });
  if (entries.length === 0) return null;
  return (
    // C8: a durable transcript OBJECT sitting between turns, so it is read at the
    // transcript's own weight — body type, turn-level spacing. Rendering it at
    // metadata size (as it was) made a decision the run turned on look like a
    // footnote beside the answer it produced.
    <section
      className="flex flex-col gap-fg-2 rounded-fg-md border border-rule bg-paper-sunken px-fg-3 py-fg-2"
      aria-label={recapHeading.usedFallback ? undefined : recapHeading.message}
      data-clarification-recap
    >
      {!recapHeading.usedFallback && (
        <p className="text-meta text-ink-faint">{recapHeading.message}</p>
      )}
      <dl className="flex flex-col gap-fg-2">
        {entries.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-fg-0-5">
            <dt className="text-body-strong text-ink">
              {authoredDisplayText(entry.prompt)}
            </dt>
            <dd className="text-body text-ink-muted">
              {authoredDisplayText(entry.answer)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The questionnaire. Renders at the park point while `pending` is disclosed; once
 * the answers land it collapses into the recap, which is what the transcript keeps.
 */
export function ClarificationCard({
  runId,
  pending,
}: {
  runId: string;
  pending: PendingClarification;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const respond = useRespondToClarification();
  const [draft, setDraft] = useState<ClarificationDraft>({});
  const [failed, setFailed] = useState(false);

  const region = resolveMessage({ key: MSG.region });
  const heading = resolveMessage({ key: MSG.heading });
  const submitLabel = resolveMessage({ key: MSG.submit });
  const requiredLabel = resolveMessage({ key: MSG.required });
  const placeholder = resolveMessage({ key: MSG.answerPlaceholder });

  if (region.usedFallback || heading.usedFallback || submitLabel.usedFallback) {
    return null;
  }

  const complete = clarificationAnswersComplete(pending.questions, draft);
  const body = clarificationAnswerBody(pending.questions, draft);
  const submittable = complete && body !== null && !respond.isPending;

  const setAnswer = (questionId: string, value: string) => {
    setFailed(false);
    setDraft((current) => ({ ...current, [questionId]: value }));
  };

  const submit = async (answered: ClarificationDraft = draft) => {
    const answers = clarificationAnswerBody(pending.questions, answered);
    if (answers === null) return;
    setFailed(false);
    try {
      const result = await respond.mutateAsync({
        runId,
        requestId: pending.requestId,
        answers,
      });
      // A refusal is a VALUE on this edge, not a throw — treat it exactly as a
      // failure so a refused answer never collapses the card and strands the run.
      if (!result.ok) {
        setFailed(true);
        return;
      }
      // Hand the recap to the store BEFORE the invalidated status refetch lands and
      // unmounts this card. The transcript renders it from there, so the record
      // outlives the component that captured it.
      recordClarificationRecap(
        runId,
        pending.requestId,
        clarificationRecap(pending.questions, answers),
      );
    } catch {
      setFailed(true);
    }
  };

  // A parked run asks its question the way the reference agent surfaces ask one:
  // as part of the CONVERSATION, not as a form panel dropped into it. The assistant
  // turn is open full-width text (C1), the question is prose at conversation size,
  // and the choices are inline chips directly under it. The only chrome is a single
  // accent rule marking the turn as awaiting the user — a panel border, a raised
  // fill and a heading row all read as "form", which is what the owner rejected.
  //
  // One choice question answers on CLICK: picking the option IS the reply, the way
  // a suggested-reply chip works in every reference. A submit affordance appears
  // only when the answer cannot be one click — free text, or more than one question.
  // A payload carrying no questions is nothing to answer: render nothing rather
  // than a heading over an empty frame with a dead send control.
  if (pending.questions.length === 0) return null;

  const singleChoice =
    pending.questions.length === 1 && pending.questions[0]!.kind === "choice";

  return (
    <section
      className="flex flex-col gap-fg-3 border-l-2 border-accent/40 pl-fg-3"
      aria-label={region.message}
      data-clarification-card={pending.requestId}
    >
      <p className="text-body text-ink">{heading.message}</p>
      <ol className="flex flex-col gap-fg-3">
        {pending.questions.map((question) => (
          <li
            key={question.id}
            className="flex flex-col gap-fg-2"
            data-clarification-question={question.id}
          >
            <p className="text-body text-ink">
              {authoredDisplayText(question.prompt)}
              {question.required && !requiredLabel.usedFallback && (
                <span className="ml-fg-1 text-meta text-ink-faint">
                  {requiredLabel.message}
                </span>
              )}
            </p>
            {question.kind === "choice" ? (
              <div
                role="radiogroup"
                aria-label={authoredDisplayText(question.prompt)}
                className="flex flex-wrap gap-fg-1"
              >
                {question.options.map((option) => {
                  const selected = draft[question.id] === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setAnswer(question.id, option.id);
                        // The only question, and it is a choice: the click is the
                        // answer. Submit against the draft this click produces —
                        // component state has not settled yet in this tick.
                        if (singleChoice) {
                          void submit({ ...draft, [question.id]: option.id });
                        }
                      }}
                      disabled={respond.isPending}
                      data-clarification-option={option.id}
                      className={`rounded-fg-md border px-fg-3 py-fg-1-5 text-body text-left transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 ${
                        selected
                          ? "border-accent bg-accent-subtle text-ink"
                          : "border-rule text-ink hover:bg-paper-sunken"
                      }`}
                    >
                      {authoredDisplayText(option.label)}
                    </button>
                  );
                })}
              </div>
            ) : (
              // SINGLE-LINE by contract: the engine refuses control characters in a
              // bounded text field, so a textarea here would build answers the
              // boundary rejects.
              <input
                type="text"
                value={draft[question.id] ?? ""}
                maxLength={CLARIFICATION_MAX_ANSWER_CHARS}
                onChange={(event) => setAnswer(question.id, event.target.value)}
                placeholder={placeholder.usedFallback ? undefined : placeholder.message}
                aria-label={authoredDisplayText(question.prompt)}
                data-clarification-input={question.id}
                className="w-full rounded-fg-md border border-rule bg-paper px-fg-2 py-fg-1-5 text-body text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              />
            )}
          </li>
        ))}
      </ol>
      {failed && (
        <p
          role="status"
          className="text-meta text-state-broken"
          data-clarification-error
        >
          {resolveMessage({ key: MSG.failed }).message}
        </p>
      )}
      {!singleChoice && (
        <div className="flex">
          <Button
            variant="primary"
            disabled={!submittable}
            onClick={() => void submit()}
            data-clarification-submit
          >
            {submitLabel.message}
          </Button>
        </div>
      )}
    </section>
  );
}

/** The answer a draft would send for one question — exported for the composer's
 *  parked-state hint and the card's own tests. */
export function draftAnswer(draft: ClarificationDraft, questionId: string): string {
  return boundedAnswer(draft[questionId] ?? "");
}
