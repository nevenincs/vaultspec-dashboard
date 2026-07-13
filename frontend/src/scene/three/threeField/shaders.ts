// Decomposed from threeField.ts (module-decomposition mandate, 2026-07-12).

import { controlNumber } from "../graphControlSchema";
import {
  ICON_FADE_HI_PX,
  ICON_FADE_LO_PX,
  ICON_SIZE_MULT,
  NODE_RECEDE_SELECT,
} from "./config";

/** Format a number as a GLSL float literal so an integer default (e.g. 240) compiles
 *  as `240.0`, not the bare int `240` that GLSL rejects where a float is required. */
function glslFloat(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

// Nodes are real instanced circle GEOMETRY (a unit disc, one instance per node),
// positioned from the GPU position texture and scaled by node radius. Crisp at any
// size (MSAA on the silhouette + an fwidth edge-AA on the fill) — unlike point
// sprites, which raster a soft bitmap disc and are size-capped by the GPU.
export const NODE_VERTEX = /* glsl */ `
attribute float aIndex;
attribute float aSize;
attribute vec3 aColor;
attribute float aDim;
attribute float aHidden;
uniform sampler2D uPositions;
uniform float uTexSize;
uniform float uPixelsPerWorld;
varying vec3 vColor;
varying float vDim;
varying float vEdge;
varying float vAA;

// Nodes and edges share ONE reference frame: world-space, scaling with zoom, but
// each CLAMPED to an on-screen px band so it never vanishes when zoomed far out
// (min) nor balloons when zoomed far in (max) — the deck.gl radiusMin/MaxPixels +
// widthMin/MaxPixels pattern. This keeps the node↔edge proportion constant at every
// zoom (Obsidian/Cytoscape scale-together), fixing the prior mismatch where nodes
// scaled in world units but edges held a constant pixel width.
uniform float uPxScale;          // UI-scale (root font / 16): the screen-px band tracks the DOM
// Icon mode: the disc is ALWAYS drawn at full opacity — the doc-type icon is drawn INSIDE
// it (the sibling glyph mesh), so circle + icon read as ONE composite mark. The disc no
// longer fades out for the icon (graph-icon-inside-circle); the icon's own size-LOD fade
// lives in the glyph shader.
const float NODE_MIN_PX = ${glslFloat(controlNumber("nodeMinPx"))}; // floor on screen — visible zoomed out (schema nodeMinPx)
const float NODE_MAX_PX = ${glslFloat(controlNumber("nodeMaxPx"))}; // ceiling on screen — no balloon zoomed in (schema nodeMaxPx)

void main() {
  vec2 uv = (vec2(mod(aIndex, uTexSize), floor(aIndex / uTexSize)) + 0.5) / uTexSize;
  vec2 center = texture2D(uPositions, uv).xy;
  float ppw = uPixelsPerWorld;
  // World radius → wanted on-screen px → clamp to the band → back to world.
  float pxWanted = aSize * ppw;
  float pxC = clamp(pxWanted, NODE_MIN_PX * uPxScale, NODE_MAX_PX * uPxScale);
  float radiusWorld = ppw > 0.0 ? pxC / ppw : aSize;
  float scale = aHidden > 0.5 ? 0.0 : radiusWorld;
  vec2 world = center + position.xy * scale;
  vColor = aColor;
  vDim = aDim;
  vEdge = length(position.xy); // 0 at centre → 1 at the rim
  // Analytic edge-AA band: ~1.5 screen px at the rim, from the CLAMPED on-screen px.
  vAA = pxC > 0.0 ? clamp(1.5 / pxC, 0.0, 0.5) : 0.01;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
}
`;

export const NODE_FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uDimColor;
varying vec3 vColor;
varying float vDim;
varying float vEdge;
varying float vAA;

void main() {
  float alpha = 1.0 - smoothstep(1.0 - vAA, 1.0, vEdge);
  if (alpha <= 0.0) discard;
  // Emphasis is COLOUR-ONLY at full opacity (never an opacity fade). vDim carries the
  // CURRENT eased recede fraction (0 = focus/full category colour; up to the hover or
  // selection depth) — the CPU tween writes it per frame, so state changes cross-fade.
  vec3 col = mix(vColor, uDimColor, clamp(vDim, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
}
`;

export const EDGE_VERTEX = /* glsl */ `
attribute float aIndexA;
attribute float aIndexB;
attribute float aEnd;
attribute float aSide;
attribute float aWidthPx;
attribute vec3 aColor;
attribute float aAlpha;
attribute float aDim;
uniform sampler2D uPositions;
uniform float uTexSize;
uniform float uPixelsPerWorld;
varying vec3 vColor;
varying float vAlpha;
varying float vDim;

vec2 nodePos(float idx) {
  vec2 uv = (vec2(mod(idx, uTexSize), floor(idx / uTexSize)) + 0.5) / uTexSize;
  return texture2D(uPositions, uv).xy;
}

// Edge width shares the node frame: aWidthPx is read as a WORLD width, so it scales
// with zoom exactly like node radius (parity), then floored/capped on screen so an
// edge never disappears when zoomed far out (deck.gl widthMinPixels; sigma
// minEdgeThickness) nor dominates when zoomed in. NOTE: aWidthPx now carries WORLD
// units, not pixels — the attribute name is kept to avoid churn in the edge build.
uniform float uPxScale;         // UI-scale (root font / 16): the screen-px band tracks the DOM
const float EDGE_MIN_PX = ${glslFloat(controlNumber("edgeMinPx"))}; // floor — won't vanish (schema edgeMinPx)
const float EDGE_MAX_PX = ${glslFloat(controlNumber("edgeMaxPx"))}; // ceiling — no balloon (schema edgeMaxPx)

void main() {
  vec2 a = nodePos(aIndexA);
  vec2 b = nodePos(aIndexB);
  vec2 base = mix(a, b, aEnd);
  vec2 dir = b - a;
  float len = length(dir);
  vec2 nrm = len > 0.0001 ? vec2(-dir.y, dir.x) / len : vec2(0.0);
  float ppw = uPixelsPerWorld;
  float pxWanted = aWidthPx * ppw; // world width → on-screen px (scales with zoom)
  float pxC = clamp(pxWanted, EDGE_MIN_PX * uPxScale, EDGE_MAX_PX * uPxScale);
  float halfWorld = ppw > 0.0 ? (pxC * 0.5) / ppw : aWidthPx * 0.5;
  vec2 world = base + nrm * aSide * halfWorld;
  vColor = aColor;
  vAlpha = aAlpha;
  vDim = aDim;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
}
`;

export const EDGE_FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uDimColor;
varying vec3 vColor;
varying float vAlpha;
varying float vDim;

void main() {
  // Edges ALWAYS render at full opacity + full colour on hover — the structure stays
  // legible; de-emphasis is node-colour-only, never an edge fade (user hover redesign).
  // (vAlpha still carries the per-edge confidence opacity + the filter visibility mask —
  // a FILTERED-OUT edge is still hidden; only the HOVER emphasis no longer touches edges.)
  gl_FragColor = vec4(vColor, vAlpha);
}
`;

// Glyph layer (graph-node-icons): a quad per node textured from the doc-type mark
// atlas, sampling the SAME position texture + on-screen px clamp as the node circle so
// the icon sits exactly where the dot was. Tinted by the node's category hue (the atlas
// is a white-ink coverage map — the white-ink-then-tint contract). The quad's UVs map
// its TOP vertex to v=0 so the upright (top-down) atlas renders upright.
export const GLYPH_VERTEX = /* glsl */ `
attribute float aIndex;
attribute float aSize;
attribute vec3 aColor;
attribute float aDim;
attribute float aHidden;
attribute float aCell;
attribute vec2 aUv;
uniform sampler2D uPositions;
uniform float uTexSize;
uniform float uPixelsPerWorld;
uniform float uPxScale;
uniform float uAtlasCols;
uniform float uAtlasRows;
varying vec2 vUv;
varying vec3 vColor;
varying float vDim;
varying float vFade;
const float NODE_MIN_PX = ${glslFloat(controlNumber("nodeMinPx"))};
const float NODE_MAX_PX = ${glslFloat(controlNumber("nodeMaxPx"))};
const float ICON_MULT = ${glslFloat(ICON_SIZE_MULT)};
const float ICON_FADE_LO = ${glslFloat(ICON_FADE_LO_PX)};
const float ICON_FADE_HI = ${glslFloat(ICON_FADE_HI_PX)};

void main() {
  vec2 puv = (vec2(mod(aIndex, uTexSize), floor(aIndex / uTexSize)) + 0.5) / uTexSize;
  vec2 center = texture2D(uPositions, puv).xy;
  float ppw = uPixelsPerWorld;
  float pxC = clamp(aSize * ppw, NODE_MIN_PX * uPxScale, NODE_MAX_PX * uPxScale);
  float radiusWorld = ppw > 0.0 ? pxC / ppw : aSize;
  float scale = (aHidden > 0.5 || aCell < 0.0) ? 0.0 : radiusWorld * ICON_MULT;
  vec2 world = center + position.xy * scale;
  float col = mod(aCell, uAtlasCols);
  float row = floor(aCell / uAtlasCols);
  vUv = vec2((col + aUv.x) / uAtlasCols, (row + aUv.y) / uAtlasRows);
  vColor = aColor;
  vDim = aDim;
  vFade = smoothstep(ICON_FADE_LO * uPxScale, ICON_FADE_HI * uPxScale, pxC);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 0.0, 1.0);
}
`;

export const GLYPH_FRAGMENT = /* glsl */ `
precision mediump float;
uniform sampler2D uAtlas;
uniform vec3 uDimColor;
uniform vec3 uIconInkLight; // knockout colour for a dark/saturated disc (paper)
uniform vec3 uIconInkDark; // ink colour for a light disc
varying vec2 vUv;
varying vec3 vColor;
varying float vDim;
varying float vFade;

void main() {
  float cov = texture2D(uAtlas, vUv).r;
  // The icon sits INSIDE the filled disc as one composite mark: pick a CONTRASTING ink by
  // the disc colour's luminance — a paper knockout on a dark/saturated disc, dark ink on a
  // light disc — so the glyph is legible on ANY category fill. A de-emphasised node fades
  // its icon with the receding disc — continuously, normalised by the deepest recede so a
  // fully-receded selection-context icon sits at 0.4 and a hover-context icon stays softer.
  float a = cov * vFade * mix(1.0, 0.4, clamp(vDim / ${glslFloat(NODE_RECEDE_SELECT)}, 0.0, 1.0));
  if (a <= 0.01) discard;
  float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
  vec3 col = lum > 0.6 ? uIconInkDark : uIconInkLight;
  gl_FragColor = vec4(col, a);
}
`;
