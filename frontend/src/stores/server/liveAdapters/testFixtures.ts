// Shared test fixtures for the decomposed liveAdapters test suite,
// moved verbatim from liveAdapters.test.ts.

export const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: false, reason: "rag service down" },
};
