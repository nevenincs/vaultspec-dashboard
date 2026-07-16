const result = { reason: "private denial detail" };
const step = { id: "S01" };
const commit = { sha: "0123456789abcdef" };

declare function setError(message: string): void;

export const unsafePresentation = {
  ariaLabel: "Raw camel-case accessible name",
  checks: [{ message: "Raw check detail" }],
  errors: ["Raw error detail"],
};

export function DynamicPresentationBlindspots() {
  setError(result.reason);
  return (
    <section>
      <p>{step.id}</p>
      <button ariaLabel={`Open ${commit.sha}`}>Open</button>
    </section>
  );
}
