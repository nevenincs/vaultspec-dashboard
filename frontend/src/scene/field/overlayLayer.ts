// Feature-overlay render layer (graph-representation ADR, W03.P10).
//
// Draws the two set-overlays over the field WITHOUT moving any node:
//   - GMap country labels at the OVERVIEW LOD (constellation/feature),
//   - BubbleSets feature hulls at DOCUMENT LOD.
// Visibility is toggled by the `set-overlays` command (featureCountries /
// featureHulls); LOD gates which overlay is drawn at the current zoom. Colours
// come from the token layer (warmth-in-tokens, themes-are-oklch); the hull is a
// faint, low-chroma outline so it carries membership without competing with the
// field. Scene-layer module, framework-free.

import { Container, Graphics, Text } from "pixi.js";

import type { SemanticLevel } from "./camera";
import { countryLabels } from "./overlays";
import { featureHulls } from "./bubbleSets";
import type { SceneNodeData } from "../sceneController";
import { cssColorNumber as getCssColor } from "./tokenReads";

export interface OverlayFlags {
  featureCountries: boolean;
  featureHulls: boolean;
}

export class OverlayLayer {
  private container = new Container();
  private hullGfx = new Graphics();
  private labels = new Container();
  /** Country-label Text reused across frames, keyed by feature (B6): created/
   *  destroyed only on membership change, repositioned in place each frame. */
  private labelCache = new Map<string, Text>();
  private flags: OverlayFlags = { featureCountries: true, featureHulls: true };

  constructor(world: Container) {
    this.container.addChild(this.hullGfx);
    this.container.addChild(this.labels);
    // Overlays sit BEHIND the nodes (added first so nodes draw on top) — a
    // background membership wash, not chrome over the field.
    world.addChildAt(this.container, 0);
  }

  setFlags(flags: OverlayFlags): void {
    this.flags = { ...flags };
  }

  /**
   * Re-render overlays for the current model, positions, and LOD level. Pure
   * geometry computed by `overlays.ts` / `bubbleSets.ts`; this only draws.
   * Country labels show at overview; hulls show at document LOD. A flag set false
   * hides that overlay entirely.
   */
  render(
    nodes: readonly SceneNodeData[],
    positionOf: (id: string) => { x: number; y: number } | undefined,
    level: SemanticLevel,
  ): void {
    this.hullGfx.clear();

    const hullColor = getCssColor("--color-accent", 0x8a7d5a);
    const inkMuted = getCssColor("--color-ink-muted", 0x6a6258);

    // BubbleSets hulls: document LOD only.
    if (this.flags.featureHulls && level === "document") {
      for (const hull of featureHulls(nodes, positionOf)) {
        if (hull.points.length < 3) continue;
        this.hullGfx.moveTo(hull.points[0].x, hull.points[0].y);
        for (let i = 1; i < hull.points.length; i++) {
          this.hullGfx.lineTo(hull.points[i].x, hull.points[i].y);
        }
        this.hullGfx.closePath();
        // Faint low-chroma fill + outline (warmth-in-tokens: no second accent).
        this.hullGfx.fill({ color: hullColor, alpha: 0.06 });
        this.hullGfx.stroke({ color: hullColor, alpha: 0.35, width: 1.5 });
      }
    }

    // GMap country labels: overview LODs (constellation / feature). Reuse cached
    // Text per feature (B6, resource-hardening) — repositioned in place each
    // frame, created/destroyed only when the feature SET changes. The prior code
    // destroyed and re-created every label on every position frame, churning the
    // text atlas during the layout settle (the GPU's busiest moment).
    const wanted =
      this.flags.featureCountries && level !== "document"
        ? countryLabels(nodes, positionOf)
        : [];
    const seen = new Set<string>();
    for (const country of wanted) {
      seen.add(country.feature);
      let label = this.labelCache.get(country.feature);
      if (!label) {
        label = new Text({
          text: country.feature,
          style: { fontSize: 12, fill: inkMuted, fontWeight: "600" },
        });
        label.anchor.set(0.5);
        label.alpha = 0.7;
        this.labels.addChild(label);
        this.labelCache.set(country.feature, label);
      } else {
        // Keep theme-reactive: a no-op when the colour is unchanged.
        label.style.fill = inkMuted;
      }
      label.position.set(country.x, country.y);
    }
    // Drop labels whose feature left the set.
    for (const [feature, label] of this.labelCache) {
      if (!seen.has(feature)) {
        label.destroy();
        this.labelCache.delete(feature);
      }
    }
  }

  destroy(): void {
    this.labelCache.clear();
    this.container.destroy({ children: true });
  }
}
