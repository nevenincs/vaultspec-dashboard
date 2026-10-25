// Representation-mode enum (retained as a dashboard-state wire field).
//
// The spatial-layout COMPUTATION for the non-connectivity modes (the lineage /
// hierarchical / radial / community / temporal seed layouts and their gates and
// quality scorecard) was removed: the live three.js field renders the
// connectivity force layout only and no-ops `set-representation-mode`, so the
// dispatcher and its layout modules had no runtime consumer. This module now
// carries just the mode enum that still rides the `representation_mode`
// dashboard-state field (engine-served, normalized in `liveAdapters`). If a
// future surface needs a real alternate spatialization, reintroduce a dispatcher
// here and wire it through the field's command surface. Scene-layer module:
// framework-free.

/** The representation modes carried by the `representation_mode` wire field. Only
 *  `connectivity` is rendered today; the others are accepted/normalized values. */
export type RepresentationMode =
  | "connectivity"
  | "temporal"
  | "lineage"
  | "hierarchical"
  | "radial"
  | "community";

/** The default first-load mode. */
export const DEFAULT_REPRESENTATION_MODE: RepresentationMode = "connectivity";
