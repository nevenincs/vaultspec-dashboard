// The inspector (figma-parity-reconciliation W02.P05.S29; binding RightRail
// inspector pane, Figma node 17:618 in frame 17:563): where "node as a live lens"
// pays off in prose form — the stage shows the shape, the inspector shows the
// evidence. Renders the selected node's metadata, the ENRICHED node-evidence
// projection (documents with path + doc_type, correlated commits with subject),
// and the per-tier edge list, collapsed by default and unfolding on selection
// (the Unfolding Edges pattern).
//
// Rebuilt as a DUMB projection (dashboard-layer-ownership / views-are-projections)
// over the stores-owned `useInspectorView` model. It fetches nothing, reads no
// raw query payload, and mints no wire shape. Rebuilt onto the NEW Figma
// role-named token foundation: canonical radius (`rounded-fg-xs`) and the
// `caption` type role for dense counts, no retired radius or px-purpose type.

import { openContextMenu } from "../../stores/view/contextMenu";
import { useInspectorView } from "../../stores/view/inspector";
import { useInspectorTierExpansion } from "../../stores/view/inspectorExpansion";
import { nodeEntityView } from "../../stores/view/nodeEntity";
import { selectEdge } from "../../stores/view/selection";
// Centralized kit primitives (design-system-is-centralized): the section
// eyebrows, the key/value property rows for the node metadata, the edge-count
// badge, and the chrome chevrons all resolve to one shared definition.
import { handleKeyboardContextMenu } from "../chrome/keyboardContextMenu";
import { guardedContextMenu } from "../menus/guardedContextMenu";
import {
  Badge,
  ChevronDown,
  ChevronRight,
  PropertyRow,
  SectionLabel,
  Skeleton,
  SkeletonRow,
  StateBlock,
} from "../kit";

// The edge resolver self-registers at module load. The "node" kind is served by
// the canonical graph node resolver (registered via app/menus/registerAll), since
// the inspector node and the stage node are the same entity - one resolver.
import "./menus/edgeMenu";

// --- the inspector --------------------------------------------------------------------

export function Inspector() {
  const { scope, view } = useInspectorView();
  const { expanded: unfolded, toggle: toggleTier } = useInspectorTierExpansion(
    scope,
    view.nodeId,
    view.tierKeys,
  );

  if (view.state === "empty") {
    return <StateBlock mode="empty" message={view.message} />;
  }
  if (view.state === "event") {
    return (
      <div className={view.rootClassName} data-inspector>
        <div className={view.headerClassName}>{view.headerLabel}</div>
        <p className={view.summaryClassName}>{view.summaryLabel}</p>
      </div>
    );
  }
  if (view.state === "edge") {
    return (
      <div className={view.rootClassName} data-inspector>
        <div className={view.headerClassName}>{view.headerLabel}</div>
      </div>
    );
  }
  if (view.state === "loading") {
    return (
      <Skeleton label={view.message}>
        <SkeletonRow width="w-2/3" />
        <SkeletonRow width="w-1/2" />
        <SkeletonRow width="w-1/3" />
      </Skeleton>
    );
  }
  // Anything not yet ready is an unavailable node detail — the shared degraded
  // block carries it (state-mode-uniformity ADR), never raw error text.
  if (view.state !== "ready") {
    return <StateBlock mode="degraded" message={view.message} />;
  }

  const { node } = view;
  // The NodeEntity the header region publishes to the context-menu host. Read at
  // event time so the membership flags match the current local visual state.
  const nodeEntity = () => {
    return nodeEntityView({ id: node.id, scope, title: view.nodeEntityTitle });
  };

  return (
    <div className={view.rootClassName} data-inspector>
      <div
        tabIndex={0}
        aria-label={view.nodeAriaLabel}
        className={view.nodePanelClassName}
        onContextMenu={guardedContextMenu((e) => {
          e.preventDefault();
          openContextMenu(nodeEntity(), { x: e.clientX, y: e.clientY });
        })}
        onKeyDown={(e) => {
          handleKeyboardContextMenu(e, (anchor) =>
            openContextMenu(nodeEntity(), anchor),
          );
        }}
      >
        {/* Title: serif by the binding Reader/Title role over a key/value property
            block — the binding design's inspector header (node 17:618). The
            metadata reads as kit PropertyRows so a label/value line is the one
            shared definition (design-system-is-centralized). */}
        <div
          className={`${view.nodeTitleClassName} select-text`}
          title={view.nodeTitleAttribute}
        >
          {view.nodeTitle}
        </div>
        <dl className={view.propertyListClassName}>
          {view.propertyRows.map((row) => (
            <PropertyRow
              key={row.label}
              label={row.label}
              value={
                row.tabular ? (
                  <span data-tabular className="select-text tabular-nums">
                    {row.value}
                  </span>
                ) : (
                  <span className="select-text">{row.value}</span>
                )
              }
            />
          ))}
        </dl>
      </div>

      {view.evidence && (
        <section className={view.evidenceSectionClassName}>
          <SectionLabel className={view.sectionLabelClassName}>
            {view.evidenceSectionLabel}
          </SectionLabel>
          <ul className={view.evidenceListClassName}>
            {view.evidence.documents.map((doc) => (
              <li
                key={doc.key}
                className={view.evidenceItemClassName}
                title={doc.title}
              >
                {doc.label}
              </li>
            ))}
            {view.evidence.commits.map((commit) => (
              <li
                key={commit.key}
                className={view.evidenceItemClassName}
                title={commit.title}
              >
                {commit.label}
                {commit.rule && (
                  <span className={view.evidenceRuleClassName}>
                    {" "}
                    · via {commit.rule}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={view.edgeSectionClassName}>
        <SectionLabel className={view.sectionLabelClassName}>
          {view.edgeSectionLabel}
        </SectionLabel>
        {[...view.tiers.entries()].map(([tier, edges]) => {
          const open = unfolded.has(tier);
          return (
            <div key={tier} className={view.tierGroupClassName}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleTier(tier)}
                className={view.tierButtonClassName}
              >
                {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <span>{tier}</span>
                <span data-tabular>
                  <Badge>{edges.length}</Badge>
                </span>
              </button>
              {open && (
                <ul className={view.tierListClassName}>
                  {edges.map((edge) => (
                    <li key={edge.id}>
                      <button
                        type="button"
                        className={`${view.tierEdgeButtonClassName} select-text`}
                        title={edge.id}
                        onClick={() => selectEdge(edge.id)}
                        onContextMenu={guardedContextMenu((e) => {
                          e.preventDefault();
                          openContextMenu(
                            {
                              kind: "edge",
                              id: edge.id,
                              relation: edge.relation,
                              dst: edge.dst,
                              tier: edge.tier,
                            },
                            { x: e.clientX, y: e.clientY },
                          );
                        })}
                        onKeyDown={(e) => {
                          handleKeyboardContextMenu(e, (anchor) =>
                            openContextMenu(
                              {
                                kind: "edge",
                                id: edge.id,
                                relation: edge.relation,
                                dst: edge.dst,
                                tier: edge.tier,
                              },
                              anchor,
                            ),
                          );
                        }}
                      >
                        {edge.displayLabel}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
