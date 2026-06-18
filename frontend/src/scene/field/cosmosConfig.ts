export interface CosmosSimulationConfig {
  simulationDecay: number;
  simulationGravity: number;
  simulationCenter: number;
  simulationRepulsion: number;
  simulationRepulsionTheta: number;
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

export const COSMOS_SIMULATION_DEFAULTS: CosmosSimulationConfig = {
  simulationDecay: 1800,
  simulationGravity: 0.08,
  simulationCenter: 4,
  simulationRepulsion: 1.35,
  simulationRepulsionTheta: 1.15,
  simulationLinkSpring: 0.14,
  simulationLinkDistance: 25,
  simulationFriction: 0.85,
  pointSizeScale: 0.7,
  coldStartAlpha: 0.75,
  warmStartAlpha: 0.2,
  changeStartAlpha: 0.25,
  pinStartAlpha: 0.25,
  interactionStartAlpha: 0.45,
  interactionSimulationDecay: 8000,
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
    simulationLinkSpring: config.simulationLinkSpring,
    simulationLinkDistance: config.simulationLinkDistance,
    simulationFriction: config.simulationFriction,
    pointSizeScale: config.pointSizeScale,
  };
}
