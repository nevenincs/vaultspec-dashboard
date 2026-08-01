// The mid-run clarification questionnaire's pure half (agent-panel-shell-integration
// D5; a2a-agent-flow D5). Normalization of the SERVED payload, the required-gate,
// and the answer body the engine verb accepts.
//
// Authority, stated once: the questions come from the `run-status`
// `pending_clarification` disclosure and from nowhere else. The
// `clarification-pending` relay frame is a re-read NUDGE — it carries no question
// content this module will read — so a reloaded panel recovers the questionnaire
// from authoritative status alone, with no relay memory involved.
//
// Bounds are the engine's, mirrored here so the card refuses locally what the
// boundary would refuse anyway: at most four questions, four options per choice,
// and a single-line capped answer. Control characters are rejected at the
// boundary, which is exactly why a text answer renders as an input and never a
// textarea.
//
// Layer law: no wire, no React — plain functions over an already-read snapshot.

/** The engine's clarification caps (`routes/ops/a2a/clarification.rs`). */
export const CLARIFICATION_MAX_QUESTIONS = 4;
export const CLARIFICATION_MAX_OPTIONS = 4;
export const CLARIFICATION_MAX_ANSWER_CHARS = 4096;

export type ClarificationKind = "choice" | "text";

export interface ClarificationOption {
  readonly id: string;
  readonly label: string;
}

export interface ClarificationQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly kind: ClarificationKind;
  readonly options: ClarificationOption[];
  readonly required: boolean;
}

export interface PendingClarification {
  readonly requestId: string;
  readonly questions: ClarificationQuestion[];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** An option's readable label: the served one, or its id when the sibling served
 *  none. Both are AUTHORED data passed through, never UI copy of ours. */
function optionLabel(label: string, id: string): string {
  return label.length > 0 ? label : id;
}

/** Normalize one served option. An option without an id cannot be answered with,
 *  so it is dropped rather than rendered as an unselectable button. */
function normalizeOption(raw: unknown): ClarificationOption | null {
  if (raw === null || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = asText(rec.id).trim();
  if (id.length === 0) return null;
  return { id, label: optionLabel(asText(rec.label).trim(), id) };
}

/** Normalize one served question. A question with no id or no prompt is dropped:
 *  an unanswerable or unreadable question is worse than one fewer question. A
 *  `choice` that survived with no options degrades to `text`, so the user can
 *  still answer rather than facing a card with nothing to click. */
export function normalizeClarificationQuestion(
  raw: unknown,
): ClarificationQuestion | null {
  if (raw === null || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = asText(rec.id).trim();
  const prompt = asText(rec.prompt).trim();
  if (id.length === 0 || prompt.length === 0) return null;
  const options = Array.isArray(rec.options)
    ? rec.options
        .map(normalizeOption)
        .filter((option): option is ClarificationOption => option !== null)
        .slice(0, CLARIFICATION_MAX_OPTIONS)
    : [];
  const kind: ClarificationKind =
    rec.kind === "choice" && options.length > 0 ? "choice" : "text";
  return { id, prompt, kind, options, required: rec.required === true };
}

/**
 * Normalize the served `pending_clarification` disclosure, or null when the run is
 * not parked on one. A request that survived with no answerable question is null
 * too: a card that cannot be submitted would strand the user against a run that
 * will not resume.
 */
export function normalizePendingClarification(
  raw: unknown,
): PendingClarification | null {
  if (raw === null || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const requestId = asText(rec.request_id).trim();
  if (requestId.length === 0) return null;
  const questions = Array.isArray(rec.questions)
    ? rec.questions
        .map(normalizeClarificationQuestion)
        .filter((question): question is ClarificationQuestion => question !== null)
        .slice(0, CLARIFICATION_MAX_QUESTIONS)
    : [];
  return questions.length === 0 ? null : { requestId, questions };
}

/** A draft answer per question id, as the card holds it while the user works. */
export type ClarificationDraft = Readonly<Record<string, string>>;

/** One answer's submittable form: trimmed, and capped at the boundary's ceiling so
 *  the card never posts something the engine will refuse. */
export function boundedAnswer(value: string): string {
  return value.trim().slice(0, CLARIFICATION_MAX_ANSWER_CHARS);
}

/** Whether every REQUIRED question carries an answer. This is the submit gate —
 *  optional questions may be left blank, and blanks are omitted from the body
 *  rather than sent as empty strings. */
export function clarificationAnswersComplete(
  questions: readonly ClarificationQuestion[],
  draft: ClarificationDraft,
): boolean {
  return questions.every(
    (question) =>
      !question.required || boundedAnswer(draft[question.id] ?? "").length > 0,
  );
}

/**
 * The `answers` body for the `clarification-respond` verb: `{question_id: answer}`
 * over the questions that actually have one.
 *
 * Empty answers are OMITTED rather than sent blank — an empty string is a value the
 * parked node would have to interpret, and the engine counts entries against its
 * four-answer cap. Returns null when nothing would be sent, which the card treats
 * as not-submittable.
 */
export function clarificationAnswerBody(
  questions: readonly ClarificationQuestion[],
  draft: ClarificationDraft,
): Record<string, string> | null {
  const answers: Record<string, string> = {};
  for (const question of questions) {
    const answer = boundedAnswer(draft[question.id] ?? "");
    if (answer.length > 0) answers[question.id] = answer;
  }
  return Object.keys(answers).length === 0 ? null : answers;
}

/** One answered question, for the C8 recap the card collapses into. */
export interface ClarificationRecapEntry {
  readonly id: string;
  readonly prompt: string;
  readonly answer: string;
}

/** Build the durable recap from what was asked and what was sent. A choice answer
 *  is shown by its LABEL, not the option id the wire carried — the recap is for the
 *  reader, and the id means nothing to them. Unanswered optional questions are
 *  omitted; the recap records decisions, not blanks. */
export function clarificationRecap(
  questions: readonly ClarificationQuestion[],
  answers: Readonly<Record<string, string>>,
): ClarificationRecapEntry[] {
  const recap: ClarificationRecapEntry[] = [];
  for (const question of questions) {
    const answer = answers[question.id];
    if (answer === undefined || answer.length === 0) continue;
    const option = question.options.find((entry) => entry.id === answer);
    recap.push({
      id: question.id,
      prompt: question.prompt,
      answer: option?.label ?? answer,
    });
  }
  return recap;
}
