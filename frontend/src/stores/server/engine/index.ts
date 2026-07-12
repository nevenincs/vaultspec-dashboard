// Barrel for the decomposed engine module (module-decomposition mandate, 2026-07-12).
// Re-exports every submodule so the historical import specifier "./engine"
// (and "../engine", "../../stores/server/engine") resolves here unchanged.
// tiers is exported first so CANONICAL_TIERS is initialized before client pulls
// liveAdapters (the pre-existing engine<->liveAdapters value cycle stays safe).
export * from "./tiers";
export * from "./graphTypes";
export * from "./temporalTypes";
export * from "./statusTypes";
export * from "./client";
