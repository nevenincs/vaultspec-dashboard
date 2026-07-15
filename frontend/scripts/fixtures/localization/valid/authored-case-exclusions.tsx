declare function joinClasses(...tokens: readonly unknown[]): string;

export function AuthoredCaseExclusions(props: {
  readonly status: string;
  readonly value: string;
}) {
  const computationalUpper = props.value.toUpperCase();
  const computationalLower = props.value.toLowerCase();
  const ordinaryClassName = "flex items-center";
  const HEADER_CLASS_NAME = "normal-case";
  const textTransform = "none";
  const fontVariant = "normal";
  const fontVariantCaps = "normal";
  const presentation = { statusClassName: "font-medium" };
  // A comment mentioning uppercase is not authored presentation.
  return (
    <div className="normal-case" style={{ textTransform: "none" }}>
      <span className={ordinaryClassName} />
      <svg aria-hidden="true">
        <g transform="translate(1 1)" />
      </svg>
      <span
        className={joinClasses(
          props.status === "uppercase" && "font-medium",
          HEADER_CLASS_NAME,
          presentation.statusClassName,
        )}
      />
      <span data-upper={computationalUpper} data-lower={computationalLower} />
      <span style={{ textTransform, fontVariant, fontVariantCaps }} />
      <span style={{ fontVariant: "tabular-nums" }} />
      <svg>
        <text textTransform="none" fontVariant="normal" fontVariantCaps="normal" />
      </svg>
    </div>
  );
}
