export interface DesignSystemFixtureResult {
  readonly id: string;
  readonly passed: boolean;
  readonly status: "clean" | "violations";
  readonly codes: readonly string[];
}

export declare function runFixtureCases(): Promise<
  readonly DesignSystemFixtureResult[]
>;
