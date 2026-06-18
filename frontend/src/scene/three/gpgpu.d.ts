// Minimal ambient declaration for three's GPUComputationRenderer example addon
// (no .d.ts ships in the npm package). Only the surface this field uses.
declare module "three/examples/jsm/misc/GPUComputationRenderer.js" {
  import type {
    DataTexture,
    ShaderMaterial,
    WebGLRenderer,
    WebGLRenderTarget,
  } from "three";

  export interface Variable {
    name: string;
    material: ShaderMaterial;
    dependencies: Variable[] | null;
  }

  export class GPUComputationRenderer {
    constructor(sizeX: number, sizeY: number, renderer: WebGLRenderer);
    createTexture(): DataTexture;
    addVariable(
      variableName: string,
      fragmentShader: string,
      initialValueTexture: DataTexture,
    ): Variable;
    setVariableDependencies(variable: Variable, dependencies: Variable[]): void;
    init(): string | null;
    compute(): void;
    getCurrentRenderTarget(variable: Variable): WebGLRenderTarget;
    dispose(): void;
  }
}
