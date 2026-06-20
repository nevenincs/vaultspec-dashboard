import type { EngineEdge, EngineNode, NodeEvidence } from "../server/engine";
import type { InspectorNeighborTierView, NodeDetailView } from "../server/queries";
import {
  useActiveScope,
  useInspectorNeighborTierView,
  useNodeDetailView,
  useNodeEvidence,
} from "../server/queries";
import { graphEndpointDisplayLabel } from "./nodeLabels";
import { type ResolvedSelection, useDashboardResolvedSelection } from "./selection";

export interface InspectorEvidenceDocument {
  key: string;
  label: string;
  title: string;
}

export interface InspectorEvidenceCommit {
  key: string;
  label: string;
  title: string;
  rule?: string;
}

export interface InspectorEvidenceView {
  documents: InspectorEvidenceDocument[];
  commits: InspectorEvidenceCommit[];
}

export interface InspectorPropertyRowView {
  label: string;
  value: string;
  tabular?: boolean;
}

export interface InspectorEdgeRowView {
  id: string;
  relation: string;
  dst: string;
  tier: EngineEdge["tier"];
  label: string;
  stateLabel: string | null;
  confidenceLabel: string | null;
  displayLabel: string;
}

export type InspectorEdgeTierView = Map<EngineEdge["tier"], InspectorEdgeRowView[]>;

const INSPECTOR_EMPTY_MESSAGE_CLASS = "text-body text-ink-faint";
const INSPECTOR_UNAVAILABLE_MESSAGE_CLASS = "text-body text-state-broken";
const INSPECTOR_EVENT_ROOT_CLASS = "text-body";
const INSPECTOR_EVENT_HEADER_CLASS = "font-medium text-ink";
const INSPECTOR_EVENT_SUMMARY_CLASS = "text-ink-muted";
const INSPECTOR_READY_ROOT_CLASS = "space-y-fg-2 text-body";
const INSPECTOR_NODE_PANEL_CLASS =
  "rounded-fg-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const INSPECTOR_NODE_TITLE_CLASS = "truncate font-serif text-title text-ink";
const INSPECTOR_PROPERTY_LIST_CLASS = "mt-fg-1";
const INSPECTOR_SECTION_CLASS = "text-label";
const INSPECTOR_SECTION_LABEL_CLASS = "mb-fg-0-5";
const INSPECTOR_EVIDENCE_LIST_CLASS = "space-y-fg-0-5 text-ink-muted";
const INSPECTOR_EVIDENCE_ITEM_CLASS = "truncate";
const INSPECTOR_EVIDENCE_RULE_CLASS = "text-ink-faint";
const INSPECTOR_TIER_GROUP_CLASS = "mb-fg-0-5";
const INSPECTOR_TIER_BUTTON_CLASS =
  "flex items-center gap-fg-1 rounded-fg-xs text-ink-muted transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const INSPECTOR_TIER_LIST_CLASS = "ml-fg-3 mt-fg-0-5 space-y-fg-0-5 text-ink-muted";
const INSPECTOR_TIER_EDGE_BUTTON_CLASS = "truncate text-left hover:underline";

export type InspectorView =
  | {
      state: "empty";
      nodeId: null;
      tierKeys: EngineEdge["tier"][];
      message: string;
      messageClassName: string;
    }
  | {
      state: "event";
      event: Extract<ResolvedSelection, { kind: "event" }>;
      nodeId: null;
      tierKeys: EngineEdge["tier"][];
      headerLabel: string;
      summaryLabel: string;
      rootClassName: string;
      headerClassName: string;
      summaryClassName: string;
    }
  | {
      state: "edge";
      edge: Extract<ResolvedSelection, { kind: "edge" }>;
      nodeId: null;
      tierKeys: EngineEdge["tier"][];
      headerLabel: string;
      rootClassName: string;
      headerClassName: string;
    }
  | {
      state: "loading" | "unavailable";
      nodeId: string;
      tierKeys: EngineEdge["tier"][];
      message: string;
      messageClassName: string;
    }
  | {
      state: "ready";
      nodeId: string;
      node: EngineNode;
      nodeTitle: string;
      nodeTitleAttribute: string;
      nodeAriaLabel: string;
      nodeEntityTitle?: string;
      propertyRows: InspectorPropertyRowView[];
      evidenceSectionLabel: string;
      edgeSectionLabel: string;
      evidence: InspectorEvidenceView | null;
      tiers: InspectorEdgeTierView;
      tierKeys: EngineEdge["tier"][];
      rootClassName: string;
      nodePanelClassName: string;
      nodeTitleClassName: string;
      propertyListClassName: string;
      evidenceSectionClassName: string;
      edgeSectionClassName: string;
      sectionLabelClassName: string;
      evidenceListClassName: string;
      evidenceItemClassName: string;
      evidenceRuleClassName: string;
      tierGroupClassName: string;
      tierButtonClassName: string;
      tierListClassName: string;
      tierEdgeButtonClassName: string;
    };

function baseName(path: string): string {
  return path.replace(/^.*\//, "");
}

/** Bounded-list summary (contract §5): never silently partial. */
export function eventTouchSummary(nodeIds: string[], truncated?: number): string {
  const base = `touches ${nodeIds.join(", ")}`;
  return truncated && truncated > 0 ? `${base} +${truncated} more` : base;
}

export function deriveInspectorPropertyRows(
  node: EngineNode,
): InspectorPropertyRowView[] {
  const rows: InspectorPropertyRowView[] = [{ label: "kind", value: node.kind }];

  if (node.lifecycle) {
    rows.push({ label: "state", value: node.lifecycle.state });
  }
  if (node.lifecycle?.progress) {
    rows.push({
      label: "progress",
      value: `${node.lifecycle.progress.done}/${node.lifecycle.progress.total}`,
      tabular: true,
    });
  }
  if (node.dates?.modified) {
    rows.push({ label: "modified", value: node.dates.modified.slice(0, 10) });
  }

  return rows;
}

export function deriveInspectorEvidenceView(
  evidence: NodeEvidence | undefined,
): InspectorEvidenceView | null {
  if (!evidence) return null;
  return {
    documents: evidence.documents.slice(0, 5).map((doc) => ({
      key: doc.path,
      title: doc.path,
      label: `${doc.doc_type}: ${baseName(doc.path)}`,
    })),
    commits: evidence.commits.map((commit) => ({
      key: commit.sha,
      title: commit.subject,
      label: `commit ${commit.sha.slice(0, 7)}: ${commit.subject}`,
      rule: commit.rule,
    })),
  };
}

export function deriveInspectorEdgeTierView(
  tiers: InspectorNeighborTierView["tiers"],
): InspectorEdgeTierView {
  return new Map(
    [...tiers.entries()].map(([tier, edges]) => [
      tier,
      edges.map((edge) => {
        const label = `${edge.relation} -> ${graphEndpointDisplayLabel(edge.dst)}`;
        const stateLabel = edge.state ? `(${edge.state})` : null;
        const confidenceLabel =
          edge.tier !== "declared" ? `${Math.round(edge.confidence * 100)}%` : null;
        const displayLabel = [
          `${label}${stateLabel ? ` ${stateLabel}` : ""}`,
          confidenceLabel,
        ]
          .filter(Boolean)
          .join(" · ");

        return {
          id: edge.id,
          relation: edge.relation,
          dst: edge.dst,
          tier: edge.tier,
          label,
          stateLabel,
          confidenceLabel,
          displayLabel,
        };
      }),
    ]),
  );
}

export function deriveInspectorView(
  selection: ResolvedSelection,
  detail: NodeDetailView,
  evidence: NodeEvidence | undefined,
  neighborTiers: InspectorNeighborTierView,
): InspectorView {
  if (selection === null) {
    return {
      state: "empty",
      nodeId: null,
      tierKeys: [],
      message: "select something to inspect",
      messageClassName: INSPECTOR_EMPTY_MESSAGE_CLASS,
    };
  }
  if (selection.kind === "event") {
    return {
      state: "event",
      event: selection,
      nodeId: null,
      tierKeys: [],
      headerLabel: `event ${selection.id}`,
      summaryLabel: eventTouchSummary(selection.nodeIds, selection.truncatedNodeIds),
      rootClassName: INSPECTOR_EVENT_ROOT_CLASS,
      headerClassName: INSPECTOR_EVENT_HEADER_CLASS,
      summaryClassName: INSPECTOR_EVENT_SUMMARY_CLASS,
    };
  }
  if (selection.kind === "edge") {
    return {
      state: "edge",
      edge: selection,
      nodeId: null,
      tierKeys: [],
      headerLabel: `edge ${selection.id}`,
      rootClassName: INSPECTOR_EVENT_ROOT_CLASS,
      headerClassName: INSPECTOR_EVENT_HEADER_CLASS,
    };
  }

  if (detail.state === "loading") {
    return {
      state: "loading",
      nodeId: selection.id,
      tierKeys: neighborTiers.tierKeys,
      message: "inspecting...",
      messageClassName: INSPECTOR_EMPTY_MESSAGE_CLASS,
    };
  }
  if (detail.state === "unavailable" || detail.node === null) {
    return {
      state: "unavailable",
      nodeId: selection.id,
      tierKeys: neighborTiers.tierKeys,
      message: "node unavailable",
      messageClassName: INSPECTOR_UNAVAILABLE_MESSAGE_CLASS,
    };
  }
  if (detail.node.id !== selection.id) {
    return {
      state: "loading",
      nodeId: selection.id,
      tierKeys: neighborTiers.tierKeys,
      message: "inspecting...",
      messageClassName: INSPECTOR_EMPTY_MESSAGE_CLASS,
    };
  }

  const nodeTitle = detail.node.title ?? detail.node.id;

  return {
    state: "ready",
    nodeId: selection.id,
    node: detail.node,
    nodeTitle,
    nodeTitleAttribute: detail.node.id,
    nodeAriaLabel: `node ${nodeTitle}`,
    nodeEntityTitle: detail.node.title ?? undefined,
    propertyRows: deriveInspectorPropertyRows(detail.node),
    evidenceSectionLabel: "Evidence",
    edgeSectionLabel: "Edges by tier",
    evidence: deriveInspectorEvidenceView(evidence),
    tiers: deriveInspectorEdgeTierView(neighborTiers.tiers),
    tierKeys: neighborTiers.tierKeys,
    rootClassName: INSPECTOR_READY_ROOT_CLASS,
    nodePanelClassName: INSPECTOR_NODE_PANEL_CLASS,
    nodeTitleClassName: INSPECTOR_NODE_TITLE_CLASS,
    propertyListClassName: INSPECTOR_PROPERTY_LIST_CLASS,
    evidenceSectionClassName: INSPECTOR_SECTION_CLASS,
    edgeSectionClassName: INSPECTOR_SECTION_CLASS,
    sectionLabelClassName: INSPECTOR_SECTION_LABEL_CLASS,
    evidenceListClassName: INSPECTOR_EVIDENCE_LIST_CLASS,
    evidenceItemClassName: INSPECTOR_EVIDENCE_ITEM_CLASS,
    evidenceRuleClassName: INSPECTOR_EVIDENCE_RULE_CLASS,
    tierGroupClassName: INSPECTOR_TIER_GROUP_CLASS,
    tierButtonClassName: INSPECTOR_TIER_BUTTON_CLASS,
    tierListClassName: INSPECTOR_TIER_LIST_CLASS,
    tierEdgeButtonClassName: INSPECTOR_TIER_EDGE_BUTTON_CLASS,
  };
}

/**
 * Stores-view selector for the right-rail inspector. The component renders this
 * model and emits actions; query subscription and payload interpretation stay in
 * this boundary.
 */
export function useInspectorView(): { scope: string | null; view: InspectorView } {
  const scope = useActiveScope();
  const selection = useDashboardResolvedSelection(scope);
  const nodeId = selection?.kind === "node" ? selection.id : null;
  const detail = useNodeDetailView(nodeId, scope);
  const evidence = useNodeEvidence(nodeId, scope);
  const neighborTiers = useInspectorNeighborTierView(nodeId, scope);
  return {
    scope,
    view: deriveInspectorView(selection, detail, evidence.data, neighborTiers),
  };
}
