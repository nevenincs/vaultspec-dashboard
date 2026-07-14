// Barrel for the decomposed queries module (module-decomposition mandate, 2026-07-12).
// Re-exports every submodule so the historical import specifier `./queries` resolves
// here unchanged. Public surface is a superset of the former queries.ts (promoted
// cross-module helpers are additionally visible; no former export was removed or renamed).

export * from "./internal";
export * from "./workspaces";
export * from "./listings";
export * from "./features";
export * from "./fsBrowse";
export * from "./dashboard";
export * from "./graph";
export * from "./document";
export * from "./history-github";
export * from "./timeline-search";
export * from "./settings";
export * from "./mutations";
export * from "./comments";
export * from "./docmeta";
export * from "./status";
export * from "./pipeline";
export * from "./gitchanges";
export * from "./streams";
