// Deterministic dot-layout for the timeline (timeline fidelity rework).
//
// The lineage marks are dated documents, but the blob-true `created` date the
// engine positions them by is DAY-precision: every document authored on the same
// day shares one x. The prior surface drew each mark at `(timeToX(created),
// laneCenterY(group))`, so same-day documents in a lane landed at the IDENTICAL
// pixel and stacked invisibly on top of one another — the "clusters overlap
// incoherently / documents hide each other" defect this module fixes.
//
// The model is a beeswarm-style column pack, one per lane group, fanning AWAY
// from the central axis (design marks rise, execution marks fall — the binding
// two-lane rail). Dots whose x collide within `columnWidth` are gathered into one
// COLUMN and stacked vertically by stable id, so a dense day reads as a legible
// tower of individual dots over its date rather than a single blot. A column that
// would out-grow the lane's row budget keeps the rows it can show and collapses
// the remainder into one overflow record that names the hidden documents for the
// renderer/accessibility layer, never silently dropping marks.
//
// Pure + deterministic. Every output is a referentially-transparent function of
// the inputs: dots sort by (x, id) and stack by id, so the layout is identical
// across rerenders for the same lineage slice (the engine guarantees a stable,
// id-sorted node order — `lineage.rs`). No time, no DOM, no React: fully
// unit-testable, and the surface renders exactly what this returns.

/** The lane group a dot belongs to: 0 = design (above the axis, fans UP),
 *  1 = execution (below the axis, fans DOWN). Matches `TIMELINE_LANE_GROUPS`. */
export type DotGroup = 0 | 1;

/** One placeable mark: its stable id, its viewport x (already projected from the
 *  instant by the caller), and its lane group. */
export interface DotInput {
  id: string;
  x: number;
  group: DotGroup;
}

/** A placed individual dot: its id, the column-centered x and stacked y it draws
 *  at, its row in the column (0 = nearest the axis), and its lane group. */
export interface PlacedDot {
  id: string;
  x: number;
  y: number;
  row: number;
  group: DotGroup;
}

/** A collapsed-overflow summary record for a column too dense to draw in full: its
 *  synthetic stable id, the column-centered x and the y of the top stack slot, the
 *  count of documents it stands for, and their ids (so the renderer can name the
 *  summarized documents without hiding them). */
export interface DotCluster {
  id: string;
  x: number;
  y: number;
  count: number;
  ids: string[];
  group: DotGroup;
}

/** The full layout: the individually-drawn dots and the overflow summary records. */
export interface DotLayout {
  dots: PlacedDot[];
  clusters: DotCluster[];
}

/** The geometry the layout packs against — derived from the live chart height by
 *  [`computeDotGeometry`] so the row budget adapts when the timeline is resized. */
export interface DotGeometry {
  /** The central axis y; design fans up from here, execution down. */
  axisY: number;
  /** Distance from the axis to the FIRST row's dot center (the lollipop neck). */
  baseGap: number;
  /** Vertical pitch between stacked dots in a column. */
  rowHeight: number;
  /** The x-collision width: dots within this distance share a column/stack. */
  columnWidth: number;
  /** Max stacked rows above the axis (design lane) before overflow summarizes. */
  maxRowsAbove: number;
  /** Max stacked rows below the axis (execution lane) before overflow summarizes. */
  maxRowsBelow: number;
}

/** The dot diameter the surface draws (kept here so the geometry and the render
 *  agree on one value). */
export const DOT_PX = 9;
/** The gap added to the dot diameter for the column-collision width and the
 *  row pitch — one dot-plus-breathing-room. */
const DOT_GAP = 3;
/** The column-collision width and row pitch (dot diameter + gap). */
export const COLUMN_WIDTH = DOT_PX + DOT_GAP;
const ROW_HEIGHT = DOT_PX + DOT_GAP;
/** Axis-to-first-row neck length (the lollipop stem to the nearest dot). */
const BASE_GAP = 10;
/** Reserve at the top for the month-tick labels and at the bottom for the lane
 *  rule, so the outermost stacked dot never collides with the chrome. */
const EDGE_PAD = 12;

/**
 * Derive the pack geometry from the measured chart height. The axis sits at the
 * vertical center; each lane's row budget is however many `rowHeight` steps fit
 * between the first-row neck and the padded lane edge (at least one row, so a
 * collapsed surface still draws a single dot or an overflow record rather than
 * nothing). Pure: a function of the height alone.
 */
export function computeDotGeometry(chartHeight: number): DotGeometry {
  const h = Number.isFinite(chartHeight) && chartHeight > 0 ? chartHeight : 120;
  const axisY = h / 2;
  const rowsFor = (available: number) =>
    Math.max(1, Math.floor((available - BASE_GAP - EDGE_PAD) / ROW_HEIGHT) + 1);
  return {
    axisY,
    baseGap: BASE_GAP,
    rowHeight: ROW_HEIGHT,
    columnWidth: COLUMN_WIDTH,
    maxRowsAbove: rowsFor(axisY),
    maxRowsBelow: rowsFor(h - axisY),
  };
}

/** Group dots whose x collide within `columnWidth` into ordered columns. The
 *  inputs arrive sorted by (x, id); a dot opens a new column when it is at least
 *  `columnWidth` past the column's anchor (its first member's x), so a run of
 *  same-x dots gathers into one tower and well-separated dots stay distinct. */
function columnsOf(sorted: DotInput[], columnWidth: number): DotInput[][] {
  const columns: DotInput[][] = [];
  let current: DotInput[] = [];
  let anchorX = Number.NEGATIVE_INFINITY;
  for (const dot of sorted) {
    if (current.length === 0 || dot.x - anchorX < columnWidth) {
      if (current.length === 0) anchorX = dot.x;
      current.push(dot);
    } else {
      columns.push(current);
      current = [dot];
      anchorX = dot.x;
    }
  }
  if (current.length > 0) columns.push(current);
  return columns;
}

/** The mean x of a column's members — the date the stack centers over. With
 *  day-precision dates every member shares one x, so the mean is that x; a near-
 *  date column centers between its members. */
function columnCenterX(members: DotInput[]): number {
  let sum = 0;
  for (const m of members) sum += m.x;
  return sum / members.length;
}

/**
 * Pack one lane group's dots into stacked columns fanning away from the axis.
 * `sign` is -1 for the design lane (rows climb above the axis) and +1 for the
 * execution lane (rows fall below it); `maxRows` is that lane's row budget. A
 * column with more members than the budget shows `maxRows - 1` dots and one
 * overflow record in the top slot standing for the remainder (so the tower never
 * exceeds the budget and the hidden documents are named, not dropped).
 */
function packGroup(
  inputs: DotInput[],
  group: DotGroup,
  sign: -1 | 1,
  maxRows: number,
  geom: DotGeometry,
): { dots: PlacedDot[]; clusters: DotCluster[] } {
  const sorted = inputs
    .slice()
    .sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const dots: PlacedDot[] = [];
  const clusters: DotCluster[] = [];
  const yForRow = (row: number) =>
    geom.axisY + sign * (geom.baseGap + row * geom.rowHeight);

  for (const column of columnsOf(sorted, geom.columnWidth)) {
    // Stack by stable id so the vertical order is deterministic across rerenders.
    const members = column.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const x = columnCenterX(members);
    if (members.length <= maxRows) {
      members.forEach((m, row) => {
        dots.push({ id: m.id, x, y: yForRow(row), row, group });
      });
      continue;
    }
    // Over budget: keep the rows we can, collapse the rest into the top slot.
    const shown = Math.max(0, maxRows - 1);
    for (let row = 0; row < shown; row++) {
      dots.push({ id: members[row].id, x, y: yForRow(row), row, group });
    }
    const overflow = members.slice(shown);
    clusters.push({
      id: `cluster:${overflow[0].id}`,
      x,
      y: yForRow(shown),
      count: overflow.length,
      ids: overflow.map((m) => m.id),
      group,
    });
  }
  return { dots, clusters };
}

/**
 * Lay out every dot into non-overlapping stacked columns per lane group. The
 * single entry point the surface calls: deterministic, pure, and bounded by the
 * geometry's row budget (overflow summarizes rather than growing without limit).
 */
export function layoutDots(inputs: readonly DotInput[], geom: DotGeometry): DotLayout {
  const above = packGroup(
    inputs.filter((d) => d.group === 0),
    0,
    -1,
    geom.maxRowsAbove,
    geom,
  );
  const below = packGroup(
    inputs.filter((d) => d.group === 1),
    1,
    1,
    geom.maxRowsBelow,
    geom,
  );
  return {
    dots: [...above.dots, ...below.dots],
    clusters: [...above.clusters, ...below.clusters],
  };
}
