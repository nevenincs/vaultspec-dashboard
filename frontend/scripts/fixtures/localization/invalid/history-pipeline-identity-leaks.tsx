const commit = {
  hash: "0123456789abcdef",
  short_hash: "0123456",
  subject: "",
};
const step = { action: null as string | null, exec_node_id: null, id: "W9.P9.S9" };

export const counterfeitProjection = {
  label: "plan step",
  title: "commit",
  description: "expand message",
};

export function CounterfeitIdentityLeaks() {
  return (
    <section>
      <p>{step.id}</p>
      <p>{step.exec_node_id}</p>
      <p>{commit.hash}</p>
      <p>{commit.short_hash}</p>
      <button aria-label={`expand message for ${commit.hash}`}>Open</button>
    </section>
  );
}
