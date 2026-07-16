export function compareAuthoredDisplayText(
  locale: string,
  left: string,
  right: string,
) {
  return new Intl.Collator(locale).compare(left, right);
}

export function compareStableIdentifiers(left: string, right: string) {
  return left.localeCompare(right);
}

export function CounterfeitGlyph() {
  return <span aria-hidden>+</span>;
}
