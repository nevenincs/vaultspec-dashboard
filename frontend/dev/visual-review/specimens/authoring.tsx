// Specimens: `authoring` area (the review-diff + review-station surfaces).
//
// `DiffView` is the ONE line-diff primitive (ADR D7): a pure view over two served
// `BoundedDocumentText`s, authored directly. `ReviewStationBody` is the queue's
// wire-free view half, fed an authored `ReviewStationView` plus a no-op
// `ReviewActions` literal (typed against the exported interface — the desk would
// rather not wire the live mutation hooks for a read-only review). `DiffPanel` is
// the one real container here: it seeds `useProposalDetail`'s query at the real
// key. Fixtures below are exported so `agent.tsx` shares the same authored
// proposal shapes instead of duplicating the review-station vocabulary.

import { useLocalizedMessageResolver } from "@app/platform/localization/LocalizationProvider";
import type { TiersBlock } from "@app/stores/server/engine";
import {
  authoringKeys,
  type AppliedUnderPolicyProjection,
  type AuthoringCommandOutcome,
  type BoundedDocumentText,
  type ProposalDetail,
  type ProposalListResult,
  type ProposalProjection,
  type ReviewStationView,
} from "@app/stores/server/authoring";
import { DiffView } from "@app/app/authoring/DiffView";
import { DiffPanel } from "@app/app/authoring/DiffPanel";
import {
  ReviewStationBody,
  type ReviewActions,
} from "@app/app/authoring/ReviewStation";
import {
  ProposalDiffstatCard,
  type ProposalDiffstatView,
} from "@app/app/authoring/ProposalDiffstat";
import { Button } from "@app/app/kit";
import { Skeleton, SkeletonRow } from "@app/app/kit";

import type { SpecimenDef } from "../registry";
import type { ReviewState } from "../state";
import { tiersHealthy } from "./support";

// --- shared authored review vocabulary (imported by agent.tsx too) --------------

/** One authored `BoundedDocumentText` side. `truncated` mirrors the engine's
 *  honest byte-cap marker: `total_bytes` only exceeds `returned_bytes` when it is
 *  set, never a silent partial. */
export function boundedText(text: string, truncated = false): BoundedDocumentText {
  const bytes = text.length;
  return {
    text,
    truncated,
    total_bytes: truncated ? bytes + 4_096 : bytes,
    returned_bytes: bytes,
  };
}

const DIFF_LABEL = ".vault/research/2026-07-20-review-harness-research.md";

const DIFF_BASE_TEXT = `# Review harness research

Establishes the problem space for the alpha investigation and the two options
carried forward into the decision record.

## Scope

- The corpus is read-only; nothing here mutates a document.
`;

const DIFF_PROPOSED_TEXT = `# Review harness research

Establishes the problem space for the alpha investigation, the constraints that
bound it, and the two options carried forward into the decision record.

## Scope

- The corpus is read-only; nothing here mutates a document.
- Bounded reads only — every listing walks its cursor to completion.
`;

/** One authored `ProposalProjection`, defaulted to a manual-mode, needs-review
 *  changeset with a full eligibility set; callers override only what differs. */
export function proposalRow(
  changesetId: string,
  overrides: Partial<ProposalProjection> = {},
): ProposalProjection {
  return {
    changeset_id: changesetId,
    changeset_revision: "rev-1",
    kind: "authoring",
    status: "needs_review",
    summary: "Add review-harness specimens for the authoring surfaces",
    actor: { id: "agent:writer-fixture", kind: "agent" },
    origin_actor: { id: "agent:writer-fixture", kind: "agent" },
    operation_count: 2,
    validation: { present: true, status: "valid", approval_ready: true },
    approval: {
      present: true,
      queue_state: "queued",
      stale: false,
      approval_id: `${changesetId}-approval`,
      proposal_id: `${changesetId}-proposal`,
      reviewed_proposal_revision: "rev-1",
    },
    policy: {
      policy_version: "policy-3",
      scope_mode: "manual",
      effective_mode: "manual",
      risk: "non_destructive",
      requirement: "human_approval_required",
      reason: "Manual mode requires reviewer sign-off.",
    },
    eligibility: [
      { command: "approve", allowed: true },
      { command: "reject", allowed: true },
      { command: "edit_proposal", allowed: true },
    ],
    rollback: { available: false },
    created_at_ms: 1_753_800_000_000,
    ...overrides,
  };
}

export const PROPOSAL_ROW_1 = proposalRow("cs-review-harness-1");

export const PROPOSAL_ROW_2 = proposalRow("cs-review-harness-2", {
  status: "approved",
  summary: "Wire the desk's authoring specimens",
  operation_count: 1,
  eligibility: [{ command: "request_apply", allowed: true }],
});

export const APPLIED_ROW: AppliedUnderPolicyProjection = {
  proposal: proposalRow("cs-review-harness-applied", {
    status: "applied",
    summary: "Apply the reviewed footer copy fix",
    eligibility: [],
    approval: {
      present: true,
      queue_state: "closed",
      stale: false,
      decision: "approve",
    },
  }),
  policy_id: "policy-auto-1",
  policy_version: "policy-3",
  mode: "autonomous",
  system_actor: { id: "system:policy-engine", kind: "system" },
  applied_at_ms: 1_753_796_000_000,
  acknowledgement_count: 1,
};

/** A served agent-turn proposal carrying a `run_id` — the exact provenance
 *  `agent.tsx`'s transcript-slot specimens correlate against. */
export const AGENT_TURN_RUN_ID = "run-review-harness-alpha";

export const PROPOSAL_WITH_RUN = proposalRow("cs-agent-turn-1", {
  summary: "Fold the transcript's proposal card into review",
  run_id: AGENT_TURN_RUN_ID,
  session_id: "sess-review-harness-1",
  turn_id: "turn-review-harness-1",
});

/** The same turn's proposal, out-of-band edited since review — the served
 *  `conflict` field ProposalCard renders as its own inline degraded banner. Used
 *  as the closest honest per-row degraded analog where a read carries no
 *  tiers-driven branch of its own. */
export const PROPOSAL_CONFLICTED = proposalRow("cs-agent-turn-1", {
  status: "conflicted",
  summary: "Fold the transcript's proposal card into review",
  run_id: AGENT_TURN_RUN_ID,
  session_id: "sess-review-harness-1",
  turn_id: "turn-review-harness-1",
  eligibility: [],
  conflict: {
    child_key: "doc-1",
    reason: "The reviewed base no longer matches the current worktree revision.",
  },
});

export function proposalListResult(
  items: ProposalProjection[],
  options: {
    afterFact?: AppliedUnderPolicyProjection[];
    tiers?: TiersBlock;
    truncated?: boolean;
    afterFactTruncated?: boolean;
  } = {},
): ProposalListResult {
  return {
    items,
    truncated: options.truncated ?? false,
    cap: 50,
    applied_under_policy: {
      items: options.afterFact ?? [],
      truncated: options.afterFactTruncated ?? false,
      cap: 50,
    },
    tiers: options.tiers ?? tiersHealthy("structural"),
  };
}

const NOOP_OUTCOME: AuthoringCommandOutcome = {
  kind: "ok",
  status: "noop",
  data: {},
  tiers: {},
};

/** A no-op `ReviewActions` literal typed against the exported interface: honest
 *  (every command resolves an accepted outcome, never a mutation) and simpler
 *  than wiring `useReviewActions()`'s live mutation hooks for a read-only cell. */
const NOOP_REVIEW_ACTIONS: ReviewActions = {
  decide: () => Promise.resolve(NOOP_OUTCOME),
  requestChanges: () => Promise.resolve(NOOP_OUTCOME),
  submit: () => Promise.resolve(NOOP_OUTCOME),
  apply: () => Promise.resolve(NOOP_OUTCOME),
  rollback: () => Promise.resolve(NOOP_OUTCOME),
  acknowledge: () => Promise.resolve(NOOP_OUTCOME),
};

// --- authoring-diffview ----------------------------------------------------------

/** `DiffView` never mounts while its detail is in flight — `DiffPanel` shows a
 *  Skeleton in its place instead. So the honest "loading" render for this pure
 *  view IS that sibling Skeleton (same message key), never a fabricated diff. */
function DiffViewLoadingEquivalent() {
  const resolveMessage = useLocalizedMessageResolver();
  return (
    <Skeleton
      label={
        resolveMessage({
          key: "documents:localizationWave.authoring.loadingPreview",
        }).message
      }
    >
      <SkeletonRow width="w-3/4" />
      <SkeletonRow width="w-2/3" />
    </Skeleton>
  );
}

// --- authoring-diffpanel ----------------------------------------------------------

const DIFF_PANEL_CHANGESET_ID = "cs-diffpanel-review-harness";

function diffPanelDetail(state: ReviewState): ProposalDetail {
  if (state === "empty") {
    return {
      proposal: proposalRow(DIFF_PANEL_CHANGESET_ID),
      review_documents: [],
      tiers: tiersHealthy("structural"),
    };
  }
  // "degraded" authors the closest honest analog (right.tsx's PlanStepTree
  // precedent): DiffPanel's own StateBlock degraded branch fires only on a
  // genuine query error, which the desk never fakes, so the truncated base text
  // is what actually changes — the nested DiffView renders its real bounded-
  // preview notice.
  const truncated = state === "degraded";
  return {
    proposal: proposalRow(DIFF_PANEL_CHANGESET_ID),
    review_documents: [
      {
        child_key: "doc-1",
        document: { path: DIFF_LABEL },
        base: boundedText(DIFF_BASE_TEXT, truncated),
        proposed: boundedText(DIFF_PROPOSED_TEXT),
      },
    ],
    tiers: tiersHealthy("structural"),
  };
}

// --- authoring-reviewstation -------------------------------------------------------

const REVIEW_STATION_VIEWS: Record<ReviewState, ReviewStationView> = {
  normal: {
    rows: [PROPOSAL_ROW_1, PROPOSAL_ROW_2],
    afterFactRows: [APPLIED_ROW],
    loading: false,
    degraded: false,
    storeUnavailable: false,
    availabilityIssue: null,
    empty: false,
    truncated: false,
    afterFactTruncated: false,
    operationMode: "manual",
  },
  loading: {
    rows: [],
    afterFactRows: [],
    loading: true,
    degraded: false,
    storeUnavailable: false,
    availabilityIssue: null,
    empty: false,
    truncated: false,
    afterFactTruncated: false,
    operationMode: null,
  },
  empty: {
    rows: [],
    afterFactRows: [],
    loading: false,
    degraded: false,
    storeUnavailable: false,
    availabilityIssue: null,
    empty: true,
    truncated: false,
    afterFactTruncated: false,
    operationMode: "manual",
  },
  degraded: {
    rows: [PROPOSAL_ROW_1],
    afterFactRows: [],
    loading: false,
    degraded: true,
    storeUnavailable: false,
    availabilityIssue: "informationMayBeOutOfDate",
    empty: false,
    truncated: true,
    afterFactTruncated: false,
    operationMode: "manual",
  },
};

// --- registry ------------------------------------------------------------------------

// --- authoring-proposaldiffstat ------------------------------------------------
//
// The outcome card, on the captured reference grammar (see
// `.tmp/ui-captures/chatgpt-composer.png` and `chatgpt-desktop.png`). It is the
// object a finished run PRODUCES, so the states worth reviewing are about what the
// tally can HONESTLY say:
//   - normal: several files across different directories, so the muted-directory /
//     dark-filename split is actually exercised rather than asserted;
//   - loading: a single file still resolving, the smallest real card;
//   - degraded: a byte-capped file, where the counts are a FLOOR and the card must
//     say so rather than present a truncated tally as exact;
//   - empty: no files, where the card renders NOTHING at all — a proposal that
//     changes nothing must not draw a card claiming it did.
//
// Authored as a derived view, not raw documents: the derivation is unit-tested
// beside the component, so the cell reviews the SHAPE rather than re-running the fold.

const DIFFSTAT_ACTION = (
  <Button variant="ghost" aria-expanded={false}>
    Review changes
  </Button>
);

const DIFFSTAT_VIEWS: Readonly<Record<ReviewState, ProposalDiffstatView>> = {
  normal: {
    files: [
      {
        label: "engine/crates/vaultspec-api/src/routes/graph.rs",
        added: 84,
        removed: 12,
      },
      { label: "frontend/src/stores/server/systemPrograms.ts", added: 41, removed: 3 },
      {
        label: "frontend/src/app/panels/BackendHealthPanel.tsx",
        added: 22,
        removed: 96,
      },
      { label: "README.md", added: 8, removed: 0 },
    ].map((f) => ({ ...f, truncated: false })),
    added: 155,
    removed: 111,
    truncated: false,
  },
  loading: {
    files: [
      {
        label: "frontend/src/app/authoring/ProposalDiffstat.tsx",
        added: 3,
        removed: 1,
        truncated: false,
      },
    ],
    added: 3,
    removed: 1,
    truncated: false,
  },
  degraded: {
    files: [
      {
        label: "engine/crates/engine-graph/src/linkage.rs",
        added: 1204,
        removed: 880,
        truncated: true,
      },
      { label: "docs/architecture.md", added: 12, removed: 4, truncated: false },
    ],
    added: 1216,
    removed: 884,
    truncated: true,
  },
  empty: { files: [], added: 0, removed: 0, truncated: false },
};

export const authoringSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "authoring-diffview": {
    note: "Pure view: DiffView takes two served BoundedDocumentTexts directly and never mounts during an in-flight fetch (its host, DiffPanel, shows a Skeleton in its place) — 'loading' therefore renders that sibling Skeleton (identical message key) as the honest equivalent, never a fabricated diff. 'degraded' authors the base side's own truncated marker, DiffView's real bounded-preview affordance.",
    render: (state) => {
      if (state === "loading") return <DiffViewLoadingEquivalent />;
      if (state === "empty") {
        return (
          <DiffView
            base={boundedText(DIFF_BASE_TEXT)}
            proposed={boundedText(DIFF_BASE_TEXT)}
            label={DIFF_LABEL}
            source="proposal-preview"
          />
        );
      }
      if (state === "degraded") {
        return (
          <DiffView
            base={boundedText(DIFF_BASE_TEXT, true)}
            proposed={boundedText(DIFF_PROPOSED_TEXT)}
            label={DIFF_LABEL}
            source="proposal-preview"
          />
        );
      }
      return (
        <DiffView
          base={boundedText(DIFF_BASE_TEXT)}
          proposed={boundedText(DIFF_PROPOSED_TEXT)}
          label={DIFF_LABEL}
          source="proposal-preview"
        />
      );
    },
  },

  "authoring-proposaldiffstat": {
    note: "Mounts the wire-free ProposalDiffstatCard directly with an authored derived view — the outcome card on the captured reference grammar (icon tile, bold 'Edited N files', aggregate beneath, muted directory + dark filename per row, action terminal-right). Normal spreads files across directories so the path split is exercised; degraded is a byte-capped file where the counts are a FLOOR and the card says so; empty renders NOTHING, because a proposal that changes nothing must not draw a card claiming it did.",
    render: (state) => (
      <ProposalDiffstatCard view={DIFFSTAT_VIEWS[state]} action={DIFFSTAT_ACTION} />
    ),
  },

  "authoring-reviewstation": {
    note: "Wire-free view: ReviewStationBody takes an authored ReviewStationView directly (never a seeded query) plus a no-op ReviewActions literal typed against the exported interface — useReviewActions() itself needs live mutation hooks the desk would rather not wire for a read-only review. 'degraded' authors view.degraded/informationMayBeOutOfDate (tiers-truth) rather than the alternate storeUnavailable branch, so the queue rows stay visible alongside the inline banner.",
    render: (state) => (
      <ReviewStationBody
        view={REVIEW_STATION_VIEWS[state]}
        actions={NOOP_REVIEW_ACTIONS}
      />
    ),
  },

  "authoring-diffpanel": {
    note: "Container over useProposalDetail(changesetId): seeds authoringKeys.proposal(changesetId) with a ProposalDetail at the real key. Loading leaves the key unseeded so the query pends and the component's own Skeleton renders. DiffPanel's StateBlock degraded branch fires only on a genuine query error (never faked here); 'degraded' therefore authors the closest honest analog — a truncated base text, so the nested DiffView renders its real bounded-preview notice.",
    seed: (client, state) => {
      if (state === "loading") return;
      client.setQueryData(
        authoringKeys.proposal(DIFF_PANEL_CHANGESET_ID),
        diffPanelDetail(state),
      );
    },
    render: () => <DiffPanel changesetId={DIFF_PANEL_CHANGESET_ID} />,
  },
};
