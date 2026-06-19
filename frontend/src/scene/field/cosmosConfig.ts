export interface CosmosSimulationConfig {
  simulationDecay: number;
  simulationGravity: number;
  simulationCenter: number;
  simulationRepulsion: number;
  simulationRepulsionTheta: number;
  /** Caps repulsion force-sampling depth on the default many-body path. It does
   *  not reduce the spaceSize-bound pyramid build, which is the dominant small-N
   *  cost; lower values trade a little force accuracy for cheaper sampling. */
  simulationRepulsionQuadtreeLevels: number;
  simulationLinkSpring: number;
  simulationLinkDistance: number;
  simulationFriction: number;
  pointSizeScale: number;
  coldStartAlpha: number;
  warmStartAlpha: number;
  changeStartAlpha: number;
  pinStartAlpha: number;
  interactionStartAlpha: number;
  interactionSimulationDecay: number;
}

// SETTLE-AND-STOP budget (graph-perf, 2026-06-18). cosmos cools the sim by
// `alpha += (alphaTarget - alpha) * (1 - 0.001^(1/decay))` per tick and auto-ends
// it (`stop()` → onSimulationEnd → GPU idles) once `alpha < 0.001`. So `decay` is
// the SETTLE LENGTH in ticks: from the cold-start alpha (0.75) it takes
// ~`ln(0.001/0.75) / ln(1 - alphaDecay)` ticks to stop. The prior defaults
// (decay 1800 ≈ ~1,700 ticks; interaction 8000 ≈ ~7,700 ticks) kept the expensive
// GPU force loop running for minutes — effectively forever during interaction —
// which pegged the GPU and prevented the render-on-demand idle from ever firing.
// These values target a canonical d3-force-style settle (~300 ticks base, fast
// re-settle after a drag) so the field cools and the GPU returns to zero.
export const COSMOS_SIMULATION_DEFAULTS: CosmosSimulationConfig = {
  simulationDecay: 300,
  simulationGravity: 0.08,
  simulationCenter: 4,
  simulationRepulsion: 1.35,
  simulationRepulsionTheta: 1.15,
  simulationRepulsionQuadtreeLevels: 8,
  simulationLinkSpring: 0.14,
  simulationLinkDistance: 25,
  simulationFriction: 0.85,
  pointSizeScale: 0.7,
  coldStartAlpha: 0.75,
  warmStartAlpha: 0.2,
  changeStartAlpha: 0.25,
  pinStartAlpha: 0.25,
  interactionStartAlpha: 0.45,
  interactionSimulationDecay: 500,
};

export function cosmosGraphConfig(
  config: CosmosSimulationConfig,
  interacting = false,
): Record<string, unknown> {
  return {
    simulationDecay: interacting
      ? config.interactionSimulationDecay
      : config.simulationDecay,
    simulationGravity: config.simulationGravity,
    simulationCenter: config.simulationCenter,
    simulationRepulsion: config.simulationRepulsion,
    simulationRepulsionTheta: config.simulationRepulsionTheta,
    simulationRepulsionQuadtreeLevels: config.simulationRepulsionQuadtreeLevels,
    simulationLinkSpring: config.simulationLinkSpring,
    simulationLinkDistance: config.simulationLinkDistance,
    simulationFriction: config.simulationFriction,
    pointSizeScale: config.pointSizeScale,
  };
}
