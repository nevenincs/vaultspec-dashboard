// Specimens: `right` area (the activity rail's right-hand surfaces).
//
// `HoverCard` is a pure view over an authored `HoverCardModel` — no seed. The
// remaining four are containers; each seeds its cell's QueryClient at the real
// `engineKeys` (plus, for the status cluster, the authoring review-queue keys)
// so the mounted production component resolves entirely off authored data.

import {
  derivePlanInteriorView,
  engineKeys,
  type PlanInteriorView,
} from "@app/stores/server/queries";
import type {
  ChangedFile,
  EngineStatus,
  GitChangesSummary,
  IssuesResponse,
  PipelineResponse,
  PlanInterior,
  PRsResponse,
} from "@app/stores/server/engine";
import type { HoverCardModel } from "@app/stores/view/hoverCard";
import { CANONICAL_TIERS } from "@app/stores/server/engine";
import {
  authoringKeys,
  type ProposalListResult,
  type ProposalProjection,
} from "@app/stores/server/authoring";
import { HoverCard } from "@app/app/right/menus/HoverCard";
import { FrameworkStatusCluster } from "@app/app/right/FrameworkStatusCluster";
import { PlanStepTree } from "@app/app/right/PlanStepTree";
import { StatusTab } from "@app/app/right/StatusTab";
import { ChangesOverview } from "@app/app/right/ChangesOverview";

import type { SpecimenDef } from "../registry";
import type { ReviewState } from "../state";
import {
  REVIEW_SCOPE,
  seedSessionAndDashboardState,
  tiersDown,
  tiersHealthy,
} from "./support";

// --- right-hovercard ---------------------------------------------------------
//
// HoverCardModel carries no loading/degraded flag of its own — the card is a
// synchronous projection of whatever identity + evidence its caller already
// resolved. The four states author the honest shapes that timeline actually
// produces: `title`/`category` arrive first (from the graph slice, ahead of the
// node-detail fetch), `summary` arrives with node detail, and `evidence` arrives
// last from its own query — so "loading" is identity-only, "degraded" is
// identity+summary with evidence unresolved, and "empty" is the component's own
// documented honest-empty case (a feature node: identity only, by design).

const HOVER_ZERO_EVIDENCE: HoverCardModel["evidence"] = {
  documentCount: 0,
  commitCount: 0,
  commitSubjects: [],
};

const HOVER_MODELS: Record<ReviewState, HoverCardModel> = {
  normal: {
    id: "doc:2026-07-20-review-harness-research",
    markKind: "research",
    typeLabel: { key: "documents:documentTypes.research" },
    title: "Review harness research",
    category: "research",
    summary:
      "Establishes the problem space for authored-props visual review and the four canonical states every specimen must cover.",
    evidence: {
      documentCount: 3,
      commitCount: 2,
      commitSubjects: [
        "author visual-review harness scaffold",
        "wire hermetic fetch + EventSource interception",
      ],
    },
  },
  // Pre-evidence-arrival: title/category resolved from the graph slice, but
  // neither the node-detail summary nor the evidence read has landed yet.
  loading: {
    id: "doc:2026-07-29-review-harness-plan",
    markKind: "plan",
    typeLabel: { key: "documents:documentTypes.plan" },
    title: "Review harness plan",
    category: "plan",
    evidence: HOVER_ZERO_EVIDENCE,
  },
  // Node detail resolved (title, category, summary) but the separate evidence
  // read is degraded — an honest split the pure view still renders correctly.
  degraded: {
    id: "doc:2026-07-18-review-harness-adr",
    markKind: "adr",
    typeLabel: { key: "documents:documentTypes.adr" },
    title: "Adopt authored-props visual review",
    category: "adr",
    summary:
      "Decides the desk renders real production components from authored props instead of a seeded engine double.",
    evidence: HOVER_ZERO_EVIDENCE,
  },
  // The component's own documented honest-empty case: a feature node has no
  // body and no `/evidence` route, so the card renders identity only.
  empty: {
    id: "feature:review-harness",
    markKind: "feature",
    typeLabel: { key: "graph:hover.types.feature" },
    title: "review-harness",
    category: "feature",
    evidence: HOVER_ZERO_EVIDENCE,
  },
};

// --- right-frameworkstatuscluster --------------------------------------------

const STATUS_HEALTHY: EngineStatus = {
  ok: true,
  nodes: 120,
  edges: 340,
  degradations: [],
  // The rag/search chip reads the `semantic` tier: an ABSENT tier reads as
  // unavailable (contract §2, absence ≠ available), so a genuinely healthy
  // status must mark it available explicitly — an empty block reads as down.
  tiers: tiersHealthy("semantic"),
  core: { reachable: true, vault_health: "healthy" },
  rag: { service: "running", watcher: "watching", index: "fresh", jobs: 0 },
};

const STATUS_DOWN: EngineStatus = {
  ok: false,
  nodes: 0,
  edges: 0,
  degradations: ["semantic"],
  tiers: tiersDown(["semantic"]),
};

function reviewRow(id: string, summary: string): ProposalProjection {
  return {
    changeset_id: id,
    changeset_revision: "rev-1",
    kind: "authoring",
    status: "needs_review",
    summary,
    actor: { id: "agent:reviewer-fixture", kind: "agent" },
    origin_actor: { id: "agent:reviewer-fixture", kind: "agent" },
    operation_count: 1,
    validation: { present: true, status: "valid", approval_ready: true },
    approval: { present: true, queue_state: "queued", stale: false },
    eligibility: [],
    rollback: { available: false },
    created_at_ms: 1_753_800_000_000,
  };
}

function proposalList(
  items: ProposalProjection[],
  tiers: ProposalListResult["tiers"] = {},
): ProposalListResult {
  return {
    items,
    truncated: false,
    cap: 50,
    applied_under_policy: { items: [], truncated: false, cap: 50 },
    tiers,
  };
}

export const rightSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "right-hovercard": {
    note: "Pure view: HoverCardModel carries no loading/degraded field of its own, so 'loading' authors the honest pre-evidence identity-only shape and 'empty' authors the component's own documented honest-empty case (a feature node).",
    render: (state) => <HoverCard model={HOVER_MODELS[state]} onOpen={() => {}} />,
  },

  "right-frameworkstatuscluster": {
    note: "Container over useFrameworkStatusView: seeds engineKeys.status() (vault/search chips) and the authoring review-queue keys (approvals chip). 'unknown' tone (every chip) is the pre-resolution look, so loading seeds nothing.",
    seed: (client, state) => {
      if (state === "loading") return;
      if (state === "normal") {
        client.setQueryData(engineKeys.status(), STATUS_HEALTHY);
        client.setQueryData(
          authoringKeys.proposals(),
          proposalList(
            [
              reviewRow("cs-1", "Add right-rail specimens"),
              reviewRow("cs-2", "Author panel specimens"),
            ],
            tiersHealthy(...CANONICAL_TIERS),
          ),
        );
        client.setQueryData(authoringKeys.operationMode(), "assisted");
        return;
      }
      if (state === "empty") {
        client.setQueryData(engineKeys.status(), STATUS_HEALTHY);
        client.setQueryData(
          authoringKeys.proposals(),
          proposalList([], tiersHealthy(...CANONICAL_TIERS)),
        );
        client.setQueryData(authoringKeys.operationMode(), "manual");
        return;
      }
      // degraded: vault unreachable (core omitted), search's semantic tier down,
      // and the review queue's structural read degraded (same tiers reader).
      client.setQueryData(engineKeys.status(), STATUS_DOWN);
      client.setQueryData(
        authoringKeys.proposals(),
        proposalList([], tiersDown(["structural"])),
      );
    },
    render: () => <FrameworkStatusCluster />,
  },

  "right-plansteptree": {
    note: "PlanStepTree takes its resolved PlanInteriorView as a prop; planNodeId={null} keeps its internal content-fence query (for the tick stale-base hash) disabled. PlanStepTree carries no tiers-driven degraded state of its own, so 'degraded' authors its closest honest analog: the bounded-interior truncation notice.",
    render: (state) => (
      <PlanStepTree
        view={PLAN_INTERIOR_VIEWS[state]}
        planNodeId={null}
        scope={null}
        isTimeTravel={false}
      />
    ),
  },

  "right-statustab": {
    host: "relative h-[32rem] w-[24rem]",
    note: "Container: seeds the shared session + dashboard-state pair (StatusTab's timeline-mode view gates on useSession/useDashboardState) plus engineKeys.status()/gitChangesSummary (the always-mounted Changes header) and engineKeys.pipeline/prs(open)/issues(open) (the always-evaluated header counts + rail-state derivation). Every section body defaults collapsed and is unmounted by FoldSection while closed, so it fetches nothing until a reviewer expands it.",
    seed: (client, state) => {
      if (state === "loading") return;
      seedSessionAndDashboardState(client);
      if (state === "normal") {
        client.setQueryData(engineKeys.status(), STATUS_TAB_STATUS);
        client.setQueryData(
          engineKeys.gitChangesSummary(REVIEW_SCOPE),
          STATUS_TAB_CHANGES_SUMMARY,
        );
        client.setQueryData(engineKeys.pipeline(REVIEW_SCOPE), STATUS_TAB_PIPELINE);
        client.setQueryData(engineKeys.prs(REVIEW_SCOPE, "open"), STATUS_TAB_PRS_OPEN);
        client.setQueryData(
          engineKeys.issues(REVIEW_SCOPE, "open"),
          STATUS_TAB_ISSUES_OPEN,
        );
        return;
      }
      if (state === "empty") {
        // `derivePipelineStatusView` reads the `structural` tier via
        // `readTierAvailability`, where an ABSENT tier is unavailable — an
        // empty `{}` block reads as degraded, not the intended empty-but-healthy
        // pipeline (the bug that made this cell render the degraded card).
        const emptyPipeline: PipelineResponse = {
          artifacts: [],
          tiers: tiersHealthy("structural"),
        };
        const emptyPrs: PRsResponse = {
          prs: [],
          available: true,
          reason: null,
          tiers: {},
        };
        const emptyIssues: IssuesResponse = {
          issues: [],
          available: true,
          reason: null,
          tiers: {},
        };
        client.setQueryData(engineKeys.pipeline(REVIEW_SCOPE), emptyPipeline);
        client.setQueryData(engineKeys.prs(REVIEW_SCOPE, "open"), emptyPrs);
        client.setQueryData(engineKeys.issues(REVIEW_SCOPE, "open"), emptyIssues);
        return;
      }
      if (state === "degraded") {
        const degradedPipeline: PipelineResponse = {
          artifacts: [],
          tiers: tiersDown(["structural"]),
        };
        client.setQueryData(engineKeys.pipeline(REVIEW_SCOPE), degradedPipeline);
      }
    },
    render: () => <StatusTab />,
  },

  "right-changesoverview": {
    note: "Container: the header (useChangesSummary) always renders; seeds engineKeys.status() (git availability — its absence IS the designed degraded state) plus gitChangesSummary/gitChanges (the fold body, mounted only once expanded) so expanding in 'normal' shows real grouped rows.",
    seed: (client, state) => {
      if (state === "normal") {
        client.setQueryData(engineKeys.status(), CHANGES_STATUS);
        client.setQueryData(
          engineKeys.gitChangesSummary(REVIEW_SCOPE),
          CHANGES_SUMMARY_NORMAL,
        );
        client.setQueryData(engineKeys.gitChanges(REVIEW_SCOPE), CHANGES_FILES_NORMAL);
        return;
      }
      if (state === "empty") {
        const emptySummary: GitChangesSummary = {
          files: 0,
          documents: 0,
          additions: 0,
          deletions: 0,
          clean: true,
          tiers: {},
        };
        client.setQueryData(engineKeys.status(), CHANGES_STATUS);
        client.setQueryData(engineKeys.gitChangesSummary(REVIEW_SCOPE), emptySummary);
        client.setQueryData(engineKeys.gitChanges(REVIEW_SCOPE), [] as ChangedFile[]);
        return;
      }
      if (state === "degraded") {
        // The engine answered but carries no `git` payload at all — the
        // component's own documented designed-degraded case (never a tiers block;
        // `git` is not one of the four canonical tiers).
        const noGitStatus: EngineStatus = {
          ok: true,
          nodes: 4,
          edges: 6,
          degradations: [],
          tiers: {},
        };
        client.setQueryData(engineKeys.status(), noGitStatus);
      }
      // loading: leave engineKeys.status() unseeded — the status read stays
      // pending, so `useGitStatus()` reports `loading: true` directly.
    },
    render: () => <ChangesOverview />,
  },
};

// --- right-plansteptree fixtures ---------------------------------------------

const PLAN_STEP_TREE_NORMAL_INTERIOR: PlanInterior = {
  plan_node_id: "plan:review-harness",
  waves: [],
  phases: [
    {
      node_id: "phase:review-harness-p01",
      id: "P01",
      heading: "Framework",
      steps: [
        {
          node_id: "step:review-harness-s01",
          id: "S01",
          action: "Design the specimen registry",
          done: true,
          exec_node_id: "exec:review-harness-p01-s01",
        },
        {
          node_id: "step:review-harness-s02",
          id: "S02",
          action: "Wire the hermetic desk shell",
          done: true,
          exec_node_id: "exec:review-harness-p01-s02",
        },
      ],
      rollup: { done: 2, total: 2 },
    },
    {
      node_id: "phase:review-harness-p02",
      id: "P02",
      heading: "Specimens",
      steps: [
        {
          node_id: "step:review-harness-s03",
          id: "S03",
          action: "Author right-rail specimens",
          done: false,
        },
        {
          node_id: "step:review-harness-s04",
          id: "S04",
          action: "Author panel specimens",
          done: false,
        },
      ],
      rollup: { done: 0, total: 2 },
    },
  ],
  steps: [],
  summary: {
    wave_count: 0,
    phase_count: 2,
    step_count: 4,
    done_count: 2,
    plan_state: "in-progress",
  },
  truncated: null,
};

const PLAN_STEP_TREE_TRUNCATED_INTERIOR: PlanInterior = {
  plan_node_id: "plan:review-harness",
  waves: [],
  phases: [
    {
      node_id: "phase:review-harness-p01",
      id: "P01",
      heading: "Framework",
      steps: [
        {
          node_id: "step:review-harness-s01",
          id: "S01",
          action: "Design the specimen registry",
          done: true,
          exec_node_id: "exec:review-harness-p01-s01",
        },
      ],
      rollup: { done: 1, total: 24 },
    },
  ],
  steps: [],
  summary: {
    wave_count: 0,
    phase_count: 1,
    step_count: 24,
    done_count: 1,
    plan_state: "in-progress",
  },
  truncated: {
    total_nodes: 40,
    returned_nodes: 24,
    reason: "plan-interior node ceiling",
  },
};

const PLAN_INTERIOR_VIEWS: Record<ReviewState, PlanInteriorView> = {
  normal: derivePlanInteriorView(PLAN_STEP_TREE_NORMAL_INTERIOR, false),
  loading: derivePlanInteriorView(undefined, true),
  empty: derivePlanInteriorView(undefined, false),
  degraded: derivePlanInteriorView(PLAN_STEP_TREE_TRUNCATED_INTERIOR, false),
};

// --- right-statustab fixtures -------------------------------------------------

const STATUS_TAB_STATUS: EngineStatus = {
  ok: true,
  nodes: 120,
  edges: 340,
  degradations: [],
  tiers: {},
  git: { branch: "main", ahead: 1, behind: 0, dirty: true },
  core: { reachable: true, vault_health: "healthy" },
  rag: { service: "running", watcher: "watching", index: "fresh", jobs: 0 },
};

const STATUS_TAB_CHANGES_SUMMARY: GitChangesSummary = {
  files: 4,
  documents: 2,
  additions: 186,
  deletions: 42,
  clean: false,
  tiers: {},
};

// `derivePipelineStatusView` gates `plansView.degraded` on the `structural`
// tier via `readTierAvailability` — an ABSENT tier reads as unavailable
// (contract §2, absence ≠ available), so this healthy fixture must mark it
// available explicitly. An empty `{}` block here was the reported bug: it read
// as degraded and made both the "normal" and "empty" cells render the
// degraded rail card.
const STATUS_TAB_PIPELINE: PipelineResponse = {
  artifacts: [
    {
      node_id: "plan:2026-07-30-review-harness",
      stem: "2026-07-30-review-harness-plan",
      title: "Review harness plan",
      doc_type: "plan",
      tier: "L2",
      progress: { done: 5, total: 9 },
      feature_tags: ["review-harness"],
      dates: { created: "2026-07-20", modified: "2026-07-29" },
      phase: "execute",
    },
    {
      node_id: "plan:2026-07-12-editor-demo",
      stem: "2026-07-12-editor-demo-plan",
      title: "Editor demo plan",
      doc_type: "plan",
      tier: "L1",
      progress: { done: 2, total: 2 },
      feature_tags: ["editor-demo"],
      dates: { created: "2026-07-10", modified: "2026-07-15" },
      phase: "review",
    },
    {
      node_id: "adr:2026-07-18-review-harness-adr",
      stem: "2026-07-18-review-harness-adr",
      title: "Adopt authored-props visual review",
      doc_type: "adr",
      status: "accepted",
      feature_tags: ["review-harness"],
      dates: { created: "2026-07-18", modified: "2026-07-18" },
      phase: "adr",
    },
  ],
  tiers: tiersHealthy("structural"),
};

const STATUS_TAB_PRS_OPEN: PRsResponse = {
  prs: [
    {
      number: 812,
      title: "Add right-rail visual-review specimens",
      author: "octocat",
      state: "open",
      is_draft: false,
      url: "https://github.com/example/example/pull/812",
      created_at: "2026-07-29T10:00:00Z",
      updated_at: "2026-07-30T09:00:00Z",
      merged_at: null,
      review_decision: "approved",
      checks: { total: 6, passed: 6, failing: 0, pending: 0 },
    },
    {
      number: 815,
      title: "Author panel visual-review specimens",
      author: "octocat",
      state: "open",
      is_draft: true,
      url: "https://github.com/example/example/pull/815",
      created_at: "2026-07-30T08:00:00Z",
      updated_at: "2026-07-30T11:00:00Z",
      merged_at: null,
      review_decision: "",
      checks: { total: 6, passed: 4, failing: 2, pending: 0 },
    },
  ],
  available: true,
  reason: null,
  tiers: {},
};

const STATUS_TAB_ISSUES_OPEN: IssuesResponse = {
  issues: [
    {
      number: 405,
      title: "Right rail loses focus on refresh",
      author: "octocat",
      state: "open",
      url: "https://github.com/example/example/issues/405",
      created_at: "2026-07-22T12:00:00Z",
      updated_at: "2026-07-29T15:00:00Z",
      labels: ["bug", "right-rail"],
    },
  ],
  available: true,
  reason: null,
  tiers: {},
};

// --- right-changesoverview fixtures -------------------------------------------

const CHANGES_STATUS: EngineStatus = {
  ok: true,
  nodes: 120,
  edges: 340,
  degradations: [],
  tiers: {},
  git: { branch: "main", ahead: 0, behind: 0, dirty: true },
  core: { reachable: true, vault_health: "healthy" },
};

const CHANGES_SUMMARY_NORMAL: GitChangesSummary = {
  files: 3,
  documents: 1,
  additions: 162,
  deletions: 26,
  clean: false,
  tiers: {},
};

const CHANGES_FILES_NORMAL: ChangedFile[] = [
  {
    path: "frontend/src/app/right/ChangesOverview.tsx",
    code: " M",
    letter: "M",
    group: "modified",
    adds: 34,
    dels: 6,
    vault: false,
  },
  {
    path: "frontend/src/app/right/StatusTab.tsx",
    code: "??",
    letter: "A",
    group: "untracked",
    adds: 120,
    dels: 0,
    vault: false,
  },
  {
    path: "frontend/src/app/right/railStates.tsx",
    code: " D",
    letter: "D",
    group: "deleted",
    adds: 0,
    dels: 18,
    vault: false,
  },
  {
    path: ".vault/plan/2026-07-30-review-harness-plan.md",
    code: " M",
    letter: "M",
    group: "modified",
    adds: 8,
    dels: 2,
    vault: true,
  },
];
