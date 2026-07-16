export const NODE_INTERIOR_MESSAGE_POLICY = {
  "graph:islands.labels.status": { role: "label" },
  "graph:islands.labels.type": { role: "label" },
  "graph:islands.progress.stepsComplete": { role: "status" },
  "graph:islands.states.active": { role: "status" },
  "graph:islands.states.archived": { role: "status" },
  "graph:islands.states.broken": { role: "status" },
  "graph:islands.states.complete": { role: "status" },
  "graph:islands.states.featureLoading": { role: "status" },
  "graph:islands.states.loading": { role: "status" },
  "graph:islands.states.stale": { role: "status" },
  "graph:islands.states.unavailable": { role: "error-message" },
} as const;
