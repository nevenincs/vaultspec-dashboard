// Documentation may mention <button> and w-[5rem] without creating executable sites.
export function CommentAndUnitlessExclusions() {
  const related = ["stem"];
  const stem = "item";
  return <div className="opacity-[0.5]">{[...related, stem].join(" ")}</div>;
}
