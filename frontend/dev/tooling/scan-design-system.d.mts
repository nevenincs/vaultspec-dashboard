export interface DesignSystemFinding {
  readonly code: string;
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly detail: string;
}

export interface DesignSystemScanSummary {
  readonly classificationFiles: number;
  readonly nativeControls: number;
  readonly relativeExecutableSites: number;
  readonly relativeClassifiedExceptions: number;
  readonly ownershipFiles: number;
  readonly pendingAppKitDeepImports: number;
  readonly pendingLowerLayerKitImports: number;
  readonly findings: number;
  readonly sceneFingerprint: string | null;
}

export interface DesignSystemScanReport {
  readonly schema: string;
  readonly status: "clean" | "violations";
  readonly summary: DesignSystemScanSummary;
  readonly findings: readonly DesignSystemFinding[];
}

export interface NativeElementCounts {
  readonly button: number;
  readonly input: number;
  readonly select: number;
  readonly textarea: number;
}

export interface DesignSystemScanOptions {
  readonly frontendRoot?: string;
  readonly ledgerModule?: object;
  readonly checkSceneFingerprint?: boolean;
  readonly duplicateSiteBindings?: readonly (readonly [
    path: string,
    owner: string,
    element: string,
    slots: readonly string[],
  ])[];
  readonly expectedNativeElementCounts?: NativeElementCounts;
  readonly relativeExceptions?: readonly {
    readonly path: string;
    readonly owner: string;
    readonly slot: string;
    readonly expression: string;
  }[];
}

export declare function scanDesignSystem(
  options?: DesignSystemScanOptions,
): Promise<DesignSystemScanReport>;

export declare const REPORT_SCHEMA: string;
export declare const LIMITS: Readonly<Record<string, number>>;
export declare const PENDING_APP_KIT_DEEP_IMPORTS: ReadonlySet<string>;
export declare const PENDING_LOWER_LAYER_KIT_IMPORTS: ReadonlySet<string>;
export declare const DUPLICATE_SITE_BINDINGS: readonly (readonly [
  path: string,
  owner: string,
  element: string,
  slots: readonly string[],
])[];
export declare const KNOWN_RELATIVE_SCANNER_DEFECTS: readonly object[];
export declare const DOCUMENTED_RELATIVE_VALUE_EXAMPLE: Readonly<object>;
