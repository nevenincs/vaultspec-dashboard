import type {
  EngineEdge,
  EngineNode,
  GraphSlice,
  TiersBlock,
  WireMetaEdge,
} from "../stores/server/engine";

const tiers: TiersBlock = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: true },
};

export interface GraphLabSampleTitles {
  planning: string;
  connections: string;
  history: string;
  researchNote: string;
  designNote: string;
  workPlan: string;
  progressNote: string;
  qualitySummary: string;
  projectGuidance: string;
  workGroup: string;
}

function sampleNodes(titles: GraphLabSampleTitles): EngineNode[] {
  return [
    {
      id: "feature:planning",
      kind: "feature",
      title: titles.planning,
      member_count: 8,
      feature_tags: ["planning"],
      authority_class: "roadmap",
      status_value: "in_flight",
      status_class: "provisional",
    },
    {
      id: "feature:connections",
      kind: "feature",
      title: titles.connections,
      member_count: 5,
      feature_tags: ["connections"],
      authority_class: "roadmap",
      status_value: "in_flight",
      status_class: "provisional",
    },
    {
      id: "feature:history",
      kind: "feature",
      title: titles.history,
      member_count: 7,
      feature_tags: ["history"],
      authority_class: "roadmap",
      status_value: "accepted",
      status_class: "affirmed",
    },
    {
      id: "doc:research-note",
      kind: "document",
      doc_type: "research",
      title: titles.researchNote,
      feature_tags: ["planning", "history"],
      authority_class: "substrate",
      dates: { created: "2026-06-17", modified: "2026-06-17" },
      degree_by_tier: { temporal: 3, declared: 1 },
      salience: 0.84,
      embedding: [0.12, 0.63, 0.28, 0.91],
    },
    {
      id: "doc:design-note",
      kind: "document",
      doc_type: "adr",
      title: titles.designNote,
      feature_tags: ["planning"],
      authority_class: "design",
      status_value: "accepted",
      status_class: "affirmed",
      dates: { created: "2026-06-17", modified: "2026-06-17" },
      degree_by_tier: { declared: 4, structural: 2 },
      salience: 1,
      embedding: [0.19, 0.59, 0.22, 0.88],
    },
    {
      id: "doc:work-plan",
      kind: "document",
      doc_type: "plan",
      title: titles.workPlan,
      feature_tags: ["planning", "history"],
      authority_class: "roadmap",
      lifecycle: { state: "active", progress: { done: 3, total: 6 } },
      status_value: "L2",
      status_class: "tiered",
      dates: { created: "2026-06-17", modified: "2026-06-17" },
      degree_by_tier: { declared: 5, temporal: 1 },
      salience: 0.93,
      embedding: [0.21, 0.57, 0.24, 0.85],
    },
    {
      id: "doc:progress-note",
      kind: "document",
      doc_type: "exec",
      title: titles.progressNote,
      feature_tags: ["history"],
      authority_class: "evidence",
      lifecycle: { state: "running", progress: { done: 4, total: 9 } },
      dates: { created: "2026-06-17", modified: "2026-06-17" },
      degree_by_tier: { structural: 3, temporal: 2 },
      salience: 0.72,
      embedding: [0.38, 0.51, 0.44, 0.79],
    },
    {
      id: "doc:quality-summary",
      kind: "document",
      doc_type: "audit",
      title: titles.qualitySummary,
      feature_tags: ["connections"],
      authority_class: "judgment",
      status_value: "medium",
      status_class: "graded",
      dates: { created: "2026-06-17", modified: "2026-06-17" },
      degree_by_tier: { declared: 1, structural: 2, temporal: 2 },
      salience: 0.65,
      embedding: [0.74, 0.22, 0.35, 0.42],
    },
    {
      id: "doc:project-guidance",
      kind: "document",
      doc_type: "rule",
      title: titles.projectGuidance,
      feature_tags: ["planning", "connections"],
      authority_class: "law",
      status_value: "accepted",
      status_class: "affirmed",
      dates: { created: "2026-06-12", modified: "2026-06-17" },
      degree_by_tier: { declared: 3, structural: 2 },
      salience: 0.81,
      embedding: [0.69, 0.31, 0.4, 0.51],
    },
    {
      id: "plan:work-group",
      kind: "plan-container",
      title: titles.workGroup,
      feature_tags: ["planning", "history"],
      authority_class: "roadmap",
      member_count: 4,
      lifecycle: { state: "active", progress: { done: 2, total: 4 } },
    },
  ];
}

const edges: EngineEdge[] = [
  {
    id: "edge:research-grounds-design",
    src: "doc:research-note",
    dst: "doc:design-note",
    relation: "grounds",
    derivation: "grounds",
    tier: "declared",
    confidence: 1,
    state: "resolved",
  },
  {
    id: "edge:design-authorizes-plan",
    src: "doc:design-note",
    dst: "doc:work-plan",
    relation: "authorizes",
    derivation: "authorizes",
    tier: "declared",
    confidence: 1,
    state: "resolved",
  },
  {
    id: "edge:plan-generates-progress",
    src: "doc:work-plan",
    dst: "doc:progress-note",
    relation: "generated-by",
    derivation: "generated-by",
    tier: "declared",
    confidence: 0.98,
    state: "resolved",
  },
  {
    id: "edge:progress-reviewed-by-quality",
    src: "doc:progress-note",
    dst: "doc:quality-summary",
    relation: "reviews",
    derivation: "reviews",
    tier: "temporal",
    confidence: 0.78,
  },
  {
    id: "edge:guidance-binds-design",
    src: "doc:project-guidance",
    dst: "doc:design-note",
    relation: "binds",
    derivation: "binds",
    tier: "declared",
    confidence: 1,
    state: "resolved",
  },
  {
    id: "edge:plan-wave",
    src: "doc:work-plan",
    dst: "plan:work-group",
    relation: "contains",
    tier: "structural",
    confidence: 0.92,
    state: "resolved",
  },
  {
    id: "edge:temporal-design-quality",
    src: "doc:design-note",
    dst: "doc:quality-summary",
    relation: "similar",
    tier: "temporal",
    confidence: 0.74,
  },
  {
    id: "edge:temporal-guidance-quality",
    src: "doc:project-guidance",
    dst: "doc:quality-summary",
    relation: "similar",
    tier: "temporal",
    confidence: 0.68,
  },
  {
    id: "edge:feature-graph-plan",
    src: "feature:planning",
    dst: "doc:work-plan",
    relation: "contains",
    tier: "declared",
    confidence: 1,
  },
  {
    id: "edge:feature-history-progress",
    src: "feature:history",
    dst: "doc:progress-note",
    relation: "contains",
    tier: "declared",
    confidence: 1,
  },
  {
    id: "edge:feature-connections-quality",
    src: "feature:connections",
    dst: "doc:quality-summary",
    relation: "contains",
    tier: "declared",
    confidence: 1,
  },
];

const meta_edges: WireMetaEdge[] = [
  {
    src: "feature:planning",
    dst: "feature:history",
    src_feature: "planning",
    dst_feature: "history",
    count: 3,
    breakdown_by_tier: { declared: 2, structural: 0, temporal: 0, semantic: 1 },
  },
  {
    src: "feature:planning",
    dst: "feature:connections",
    src_feature: "planning",
    dst_feature: "connections",
    count: 3,
    breakdown_by_tier: { declared: 2, structural: 0, temporal: 0, semantic: 1 },
  },
  {
    src: "feature:history",
    dst: "feature:connections",
    src_feature: "history",
    dst_feature: "connections",
    count: 2,
    breakdown_by_tier: { declared: 0, structural: 0, temporal: 1, semantic: 1 },
  },
];

export function createGraphLabSampleSlice(titles: GraphLabSampleTitles): GraphSlice {
  return {
    nodes: sampleNodes(titles),
    edges,
    meta_edges,
    tiers,
    lens: "status",
    salience_partial: false,
  };
}
