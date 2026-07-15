export function ExpandedAuthoredCaseTransforms(props: {
  readonly capsMode: string;
  readonly textMode: string;
}) {
  const fullWidth = "full-width";
  const textTransform = props.textMode;
  const fontVariant = props.capsMode;
  const fontVariantCaps = "all-small-caps";

  return (
    <div>
      <span style={{ textTransform: fullWidth }} />
      <span style={{ textTransform: "full-size-kana" }} />
      <span style={{ textTransform: "math-auto" }} />
      <span style={{ textTransform }} />
      <span style={{ fontVariant: "small-caps" }} />
      <span style={{ fontVariant }} />
      <span style={{ fontVariantCaps }} />
      <svg>
        <text
          textTransform={props.textMode}
          fontVariant="small-caps"
          fontVariantCaps={props.capsMode}
        />
      </svg>
      <span className="hover:[text-transform:full-width]" />
      <span className="[font-variant-caps:small-caps]" />
    </div>
  );
}
