import { describe, expect, it } from "vitest";

import { graphEndpointDisplayLabel, nodeIdDisplayLabel } from "./nodeLabels";

describe("node id display labels", () => {
  it("strips stable doc and feature prefixes for compact chrome labels", () => {
    expect(nodeIdDisplayLabel("doc:alpha")).toBe("alpha");
    expect(nodeIdDisplayLabel("feature:auth")).toBe("auth");
  });

  it("leaves other identities intact", () => {
    expect(nodeIdDisplayLabel("code:src/app.ts")).toBe("code:src/app.ts");
    expect(nodeIdDisplayLabel("commit:abcdef")).toBe("commit:abcdef");
  });

  it("strips every graph endpoint prefix for inspector edge labels", () => {
    expect(graphEndpointDisplayLabel("doc:alpha")).toBe("alpha");
    expect(graphEndpointDisplayLabel("feature:auth")).toBe("auth");
    expect(graphEndpointDisplayLabel("code:src/app.ts")).toBe("src/app.ts");
    expect(graphEndpointDisplayLabel("commit:abcdef")).toBe("abcdef");
  });
});
