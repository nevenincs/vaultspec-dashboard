/** Compact display label for stable graph node ids in app chrome. */
export function nodeIdDisplayLabel(id: string): string {
  return id.replace(/^(feature|doc):/, "");
}

/** Compact endpoint label for graph edge rows, where every stable node prefix is
 *  already carried by surrounding tier/species chrome. */
export function graphEndpointDisplayLabel(id: string): string {
  return id.replace(/^(feature|doc|code|commit):/, "");
}
