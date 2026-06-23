// Central context-menu resolver registration (dashboard-context-menus W03).
// Each per-surface resolver module self-registers on import; importing them all
// here once - and importing THIS module once from the app shell - guarantees
// every entity kind has its resolver registered regardless of which surface is
// mounted, and gives a single, deterministic place that owns the kind->resolver
// map (so no two modules can silently register the same kind in a racy order).
//
// One resolver per entity kind: the "event" kind is served by the timeline's
// eventMarkMenu (the richer superset - show/jump/zoom/copy), shared by the
// activity rail; the "node" kind is served by the graph node resolver once W04
// lands. Side-effect imports only.

// Left rail.
import "../left/menus/workspaceMenu";
import "../left/menus/worktreeMenu";
import "../left/menus/vaultDocMenu";
import "../left/menus/codeFileMenu";

// Right rail. (The "node" kind is served by the graph node resolver below -
// the inspector node and the stage node are the same entity, one resolver.)
import "../right/menus/edgeMenu";
import "../right/menus/searchResultMenu";
import "../right/menus/changeMenu";
import "../right/menus/commitMenu";
import "../right/menus/prMenu";

// Timeline (also the canonical "event" resolver for the activity rail).
import "../timeline/menus/eventMarkMenu";

// Graph stage (the canonical "node" resolver, plus meta-edge / island / canvas).
import "../stage/menus/graphNodeMenu";
import "../stage/menus/metaEdgeMenu";
import "../stage/menus/canvasMenu";
import "../islands/menus/islandMenu";

// The kind-agnostic global tail (Refresh), appended to every menu under the terminal
// `global` section (global-context-actions).
import "./globalTail";
