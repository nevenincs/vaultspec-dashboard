export interface SemanticInput {
  readonly id: string;
  readonly label: string;
  readonly message: string;
}

export function preserveDynamicUserData(input: SemanticInput) {
  const presentation = { label: input.label, message: input.message };
  const diagnostic = new Error("Indexer response could not be decoded");
  const stableId = "node:fixture-42";
  console.info("Localization fixture diagnostic", input.id);
  return { diagnostic, presentation, stableId };
}
