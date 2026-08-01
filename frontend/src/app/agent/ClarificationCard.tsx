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
// Layer ownership: dumb app chrome over the run-progress context plus the one
// clarification mutation. It reads no raw `tiers` and holds no wire state.

import { useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { useRespondToClarification } from "../../stores/server/agent/a2aTeam";
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
  title: "common:agent.clarification.title",
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
  const title = resolveMessage({ key: MSG.recapTitle });
  if (entries.length === 0) return null;
  return (
    <section
      className="flex flex-col gap-fg-1 rounded-fg-md border border-rule bg-paper-sunken px-fg-2 py-fg-1-5"
      aria-label={title.usedFallback ? undefined : title.message}
      data-clarification-recap
    >
      {!title.usedFallback && (
        <p className="text-caption text-ink-faint">{title.message}</p>
      )}
      <dl className="flex flex-col gap-fg-1">
        {entries.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-fg-0-5">
            <dt className="text-meta font-medium text-ink">
              {authoredDisplayText(entry.prompt)}
            </dt>
            <dd className="text-meta text-ink-muted">
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
  const [recap, setRecap] = useState<ClarificationRecapEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const region = resolveMessage({ key: MSG.region });
  const title = resolveMessage({ key: MSG.title });
  const submitLabel = resolveMessage({ key: MSG.submit });
  const requiredLabel = resolveMessage({ key: MSG.required });
  const placeholder = resolveMessage({ key: MSG.answerPlaceholder });

  // Once answered, the card IS the recap — the questions do not linger beside their
  // own answers.
  if (recap !== null) return <ClarificationRecap entries={recap} />;
  if (region.usedFallback || title.usedFallback || submitLabel.usedFallback) {
    return null;
  }

  const complete = clarificationAnswersComplete(pending.questions, draft);
  const body = clarificationAnswerBody(pending.questions, draft);
  const submittable = complete && body !== null && !respond.isPending;

  const setAnswer = (questionId: string, value: string) => {
    setFailed(false);
    setDraft((current) => ({ ...current, [questionId]: value }));
  };

  const submit = async () => {
    if (body === null) return;
    setFailed(false);
    try {
      const result = await respond.mutateAsync({
        runId,
        requestId: pending.requestId,
        answers: body,
      });
      // A refusal is a VALUE on this edge, not a throw — treat it exactly as a
      // failure so a refused answer never collapses the card and strands the run.
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setRecap(clarificationRecap(pending.questions, body));
    } catch {
      setFailed(true);
    }
  };

  return (
    <section
      className="flex flex-col gap-fg-2 rounded-fg-md border border-state-stale/40 bg-paper-raised px-fg-2 py-fg-2"
      aria-label={region.message}
      data-clarification-card={pending.requestId}
    >
      <p className="text-label font-medium text-ink">{title.message}</p>
      <ol className="flex flex-col gap-fg-2">
        {pending.questions.map((question) => (
          <li
            key={question.id}
            className="flex flex-col gap-fg-1"
            data-clarification-question={question.id}
          >
            <p className="text-meta text-ink">
              {authoredDisplayText(question.prompt)}
              {question.required && !requiredLabel.usedFallback && (
                <span className="ml-fg-1 text-caption text-ink-faint">
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
                      onClick={() => setAnswer(question.id, option.id)}
                      data-clarification-option={option.id}
                      className={`rounded-fg-pill border px-fg-3 py-fg-1 text-label transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                        selected
                          ? "border-accent bg-accent/12 text-ink"
                          : "border-rule text-ink-muted hover:text-ink"
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
                className="w-full rounded-fg-sm border border-rule bg-paper-sunken px-fg-2 py-fg-1 text-body text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
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
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={!submittable}
          onClick={() => void submit()}
          data-clarification-submit
        >
          {submitLabel.message}
        </Button>
      </div>
    </section>
  );
}

/** The answer a draft would send for one question — exported for the composer's
 *  parked-state hint and the card's own tests. */
export function draftAnswer(draft: ClarificationDraft, questionId: string): string {
  return boundedAnswer(draft[questionId] ?? "");
}
