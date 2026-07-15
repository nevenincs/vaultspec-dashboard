declare function joinClasses(...tokens: readonly string[]): string;

export function AuthoredCaseTransforms(props: { readonly compact: boolean }) {
  const lowerClass = "lowercase";
  const HEADER_CLASS = "text-caption lowercase";
  const rowClassName = joinClasses("capitalize", "font-medium");
  const presentation = { sectionButtonClassName: "uppercase tracking-wide" };
  const itemPresentation = { className: "lowercase" };
  const textTransform = "uppercase";

  return (
    <div>
      <span className="uppercase" />
      <span className={props.compact ? lowerClass : "normal-case"} />
      <span className={joinClasses("capitalize", "font-medium")} />
      <span style={{ textTransform: "uppercase" }} />
      <span style={{ textTransform: props.compact ? "lowercase" : "none" }} />
      <span style={{ textTransform: "capitalize" }} />
      <svg>
        <text className="uppercase" style={{ textTransform: "capitalize" }} />
      </svg>
      <span className={HEADER_CLASS} />
      <span className={rowClassName} />
      <span className={presentation.sectionButtonClassName} />
      <span className={itemPresentation.className} />
      <span style={{ textTransform }} />
    </div>
  );
}
