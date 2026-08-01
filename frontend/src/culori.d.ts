// Minimal ambient types for the culori subset the scene token reader uses
// (tokenReads.cssColorNumber). culori ships no declarations resolvable under this
// tsconfig, so we type just the two entry points we call: parse a CSS colour
// string into a colour object, and a converter to an sRGB {r,g,b} record. Replace
// with `@types/culori` (or culori's own types) if a resolvable declaration lands.

declare module "culori" {
  interface Rgb {
    mode: "rgb";
    r?: number;
    g?: number;
    b?: number;
    alpha?: number;
  }
  export function parse(color: string): object | undefined;
  export function converter(
    mode: "rgb",
  ): (color: object | undefined) => Rgb | undefined;
  interface Oklch {
    mode: "oklch";
    l?: number;
    c?: number;
    h?: number;
    alpha?: number;
  }
  /** Format any parsed colour as a `#rrggbb` string. */
  export function formatHex(color: object | string | undefined): string | undefined;
  /** Parse/convert a colour into OKLCH. */
  export function oklch(color: object | string | undefined): Oklch | undefined;
}
