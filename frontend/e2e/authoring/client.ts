// Authoring wire client for the e2e acceptance suite (W14.P42 S207/S208): a thin,
// framework-agnostic REST + SSE client over the REAL `/authoring/v1/*` surface —
// no mock, no store/React coupling (the frontend's `stores/server/authoring.ts`
// is a TanStack-bound facade, not reusable here). Mirrors the request shapes the
// engine's own live-wire acceptance test already exercises
// (`engine/crates/vaultspec-api/tests/authoring_p42a_acceptance.rs`), so this
// suite proves the SAME wire from the browser-facing side of the contract.

const ACTOR_TOKEN_HEADER = "x-authoring-actor-token";

export interface Envelope {
  readonly status: number;
  readonly data: Record<string, unknown>;
  readonly error?: string;
  readonly error_kind?: string;
  readonly raw: string;
}

/** Read a nested field from a loosely-typed envelope body without `any`. */
export function field(obj: Record<string, unknown>, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function str(obj: Record<string, unknown>, ...path: string[]): string {
  const v = field(obj, ...path);
  if (typeof v !== "string") {
    throw new Error(`expected string at ${path.join(".")}, got ${JSON.stringify(v)}`);
  }
  return v;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export class AuthoringClient {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
  ) {}

  async send(
    method: string,
    path: string,
    opts: { actorToken?: string; body?: unknown } = {},
  ): Promise<Envelope> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.serviceToken}`,
    };
    if (opts.actorToken) headers[ACTOR_TOKEN_HEADER] = opts.actorToken;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const raw = await res.text();
    const parsed: Record<string, unknown> = parseJsonObject(raw);
    return {
      status: res.status,
      data: (parsed["data"] as Record<string, unknown> | undefined) ?? {},
      error:
        typeof parsed["error"] === "string" ? (parsed["error"] as string) : undefined,
      error_kind:
        typeof parsed["error_kind"] === "string"
          ? (parsed["error_kind"] as string)
          : undefined,
      raw,
    };
  }

  /** The scratch worktree's server-authoritative scope token (read live off
   *  `/map`'s `worktrees[].path` — already rendered in the engine's own
   *  `scope_token_format` (absolute path, forward slashes, no extended-length
   *  prefix) — rather than re-deriving that normalization rule in TypeScript). */
  async activeScope(): Promise<string> {
    const envelope = await this.send("GET", "/map");
    const worktrees = field(envelope.data, "worktrees");
    if (!Array.isArray(worktrees)) {
      throw new Error(`/map carries no worktrees: ${envelope.raw}`);
    }
    for (const wt of worktrees) {
      const w = wt as Record<string, unknown>;
      if (w["has_vault"] === true) return str(w, "path");
    }
    throw new Error(`/map carries no vault-bearing worktree: ${envelope.raw}`);
  }

  async issueActorToken(actorId: string, kind: string): Promise<string> {
    const envelope = await this.send("POST", "/authoring/v1/actor-tokens", {
      body: { actor: { id: actorId, kind } },
    });
    if (envelope.status !== 201) {
      throw new Error(`token issuance failed (${envelope.status}): ${envelope.raw}`);
    }
    return str(envelope.data, "raw_token");
  }

  async createSession(actorToken: string, idem: string): Promise<string> {
    const envelope = await this.send("POST", "/authoring/v1/sessions", {
      actorToken,
      body: {
        api_version: "v1",
        command: "create_session",
        idempotency_key: idem,
        payload: { scope: "worktree", title: "e2e acceptance session" },
      },
    });
    if (envelope.status !== 200) {
      throw new Error(`session create failed (${envelope.status}): ${envelope.raw}`);
    }
    return str(envelope.data, "session_id");
  }

  documentRef(
    scope: string,
    doc: { nodeId: string; stem: string; path: string; docType: string },
    baseRevision: string,
  ): Record<string, unknown> {
    return {
      kind: "existing",
      scope,
      node_id: doc.nodeId,
      stem: doc.stem,
      path: doc.path,
      doc_type: doc.docType,
      base_revision: baseRevision,
    };
  }

  async createProposal(
    actorToken: string,
    sessionId: string,
    scope: string,
    doc: { nodeId: string; stem: string; path: string; docType: string },
    changesetId: string,
    idem: string,
    baseRevision: string,
    body: string,
  ): Promise<Envelope> {
    return this.send("POST", "/authoring/v1/proposals", {
      actorToken,
      body: {
        api_version: "v1",
        command: "create_proposal",
        idempotency_key: idem,
        payload: {
          session_id: sessionId,
          changeset_id: changesetId,
          summary: "e2e acceptance proposal",
          operations: [
            {
              child_key: "child_1",
              operation: "replace_body",
              target: {
                document: this.documentRef(scope, doc, baseRevision),
                base_revision: baseRevision,
                current_revision: baseRevision,
              },
              draft: { mode: "whole_document", body },
            },
          ],
        },
      },
    });
  }

  async submitForReview(
    actorToken: string,
    changesetId: string,
    expectedRevision: string,
    idem: string,
  ): Promise<Envelope> {
    return this.send("POST", `/authoring/v1/proposals/${changesetId}/submit`, {
      actorToken,
      body: {
        api_version: "v1",
        command: "submit_for_review",
        idempotency_key: idem,
        payload: { expected_revision: expectedRevision, summary: "submit e2e" },
      },
    });
  }

  async decideReview(
    actorToken: string,
    approvalId: string,
    proposalId: string,
    reviewedRevision: string,
    decision: "approve" | "reject",
    idem: string,
  ): Promise<Envelope> {
    return this.send(
      "POST",
      `/authoring/v1/reviews/${encodeURIComponent(approvalId)}/decisions`,
      {
        actorToken,
        body: {
          api_version: "v1",
          command: decision,
          idempotency_key: idem,
          payload: {
            proposal_id: proposalId,
            approval_id: approvalId,
            decision,
            reviewed_revision: reviewedRevision,
            comment: "e2e review",
          },
        },
      },
    );
  }

  async acquireLease(
    actorToken: string,
    scope: string,
    doc: { nodeId: string; stem: string; path: string; docType: string },
    baseRevision: string,
    idem: string,
  ): Promise<Envelope> {
    return this.send("POST", "/authoring/v1/leases", {
      actorToken,
      body: {
        api_version: "v1",
        command: "acquire_lease",
        idempotency_key: idem,
        payload: {
          target: this.documentRef(scope, doc, baseRevision),
          purpose: "whole_document",
          ttl_ms: 900_000,
        },
      },
    });
  }

  async apply(
    actorToken: string,
    changesetId: string,
    approvalId: string,
    idem: string,
    fencingToken?: number,
  ): Promise<Envelope> {
    const payload: Record<string, unknown> = {
      changeset_id: changesetId,
      approval_id: approvalId,
    };
    if (fencingToken !== undefined) payload["fencing_token"] = fencingToken;
    return this.send("POST", "/authoring/v1/apply-requests", {
      actorToken,
      body: {
        api_version: "v1",
        command: "request_apply",
        idempotency_key: idem,
        payload,
      },
    });
  }

  /** The changeset's CURRENT revision, freshly read (never cached) — the
   *  `rebase`/`request_apply` staleness fence keys off the actual latest
   *  revision, which can advance from a source other than the caller's own
   *  last mutation (e.g. a conflict-preflight denial recording a state
   *  transition). */
  async currentRevision(changesetId: string): Promise<string> {
    const envelope = await this.send("GET", `/authoring/v1/proposals/${changesetId}`);
    if (envelope.status !== 200) {
      throw new Error(`proposal detail failed (${envelope.status}): ${envelope.raw}`);
    }
    return str(envelope.data, "proposal", "changeset_revision");
  }

  async rebase(
    actorToken: string,
    changesetId: string,
    expectedRevision: string,
    idem: string,
  ): Promise<Envelope> {
    return this.send("POST", `/authoring/v1/proposals/${changesetId}/rebase`, {
      actorToken,
      body: {
        api_version: "v1",
        command: "rebase",
        idempotency_key: idem,
        payload: {
          changeset_id: changesetId,
          expected_revision: expectedRevision,
          summary: "e2e rebase",
        },
      },
    });
  }

  async conflicts(changesetId: string): Promise<Envelope> {
    return this.send("GET", `/authoring/v1/proposals/${changesetId}/conflicts`);
  }

  async recovery(lastSeq?: number): Promise<Envelope> {
    const query = lastSeq === undefined ? "" : `?last_seq=${lastSeq}`;
    return this.send("GET", `/authoring/v1/recovery${query}`);
  }

  async executeAgentTool(
    actorToken: string,
    runId: string,
    toolCallId: string,
    name: string,
    input: Record<string, unknown>,
    idem: string,
  ): Promise<Envelope> {
    return this.send("POST", `/authoring/v1/runs/${runId}/agent-tools/execute`, {
      actorToken,
      body: {
        api_version: "v1",
        command: "read_context",
        idempotency_key: idem,
        payload: {
          tool_call_id: toolCallId,
          name,
          idempotency_key: `idem:tool:${toolCallId}`,
          input,
        },
      },
    });
  }

  /** Read a bounded page of lifecycle replay frames off the SSE stream, then
   *  abort the connection (the route `keep_alive`s indefinitely — a real
   *  frontend reconnect keeps the connection open, but a bounded test read must
   *  stop itself). Returns the parsed `lifecycle`/`gap` frames observed within
   *  `timeoutMs`, whichever comes first. */
  async replayEvents(
    lastSeq: number,
    opts: { timeoutMs?: number; minFrames?: number } = {},
  ): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
    const timeoutMs = opts.timeoutMs ?? 3000;
    const minFrames = opts.minFrames ?? 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const frames: Array<{ event: string; data: Record<string, unknown> }> = [];
    try {
      const res = await fetch(
        `${this.baseUrl}/authoring/v1/events?last_seq=${lastSeq}`,
        {
          headers: { authorization: `Bearer ${this.serviceToken}` },
          signal: controller.signal,
        },
      );
      const reader = res.body?.getReader();
      if (!reader) return frames;
      const decoder = new TextDecoder();
      let buffer = "";
      while (frames.length < minFrames) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const eventLine = chunk.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (eventLine && dataLine) {
            const event = eventLine.slice("event:".length).trim();
            const dataStr = dataLine.slice("data:".length).trim();
            try {
              frames.push({
                event,
                data: JSON.parse(dataStr) as Record<string, unknown>,
              });
            } catch {
              /* not JSON — ignore (a bare keep-alive comment carries no data: line) */
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
      controller.abort();
    } catch (err) {
      if (!(err instanceof Error) || err.name !== "AbortError") throw err;
    } finally {
      clearTimeout(timer);
    }
    return frames;
  }
}
