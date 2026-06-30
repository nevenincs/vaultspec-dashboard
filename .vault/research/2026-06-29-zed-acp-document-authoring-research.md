---
tags:
  - '#research'
  - '#zed-acp-document-authoring'
date: '2026-06-29'
modified: '2026-06-29'
related: []
---

# `zed-acp-document-authoring` research: `Zed ACP relevance for document authoring`

Live-source review of Zed's Agent Client Protocol and Zed's external-agent
architecture, focused on what should transfer to Vaultspec's Rust backend for
semantic, approval-driven spec document editing.

## Findings

Sources reviewed:

- ACP overview: https://agentclientprotocol.com/protocol/v1/overview
- ACP transports: https://agentclientprotocol.com/protocol/v1/transports
- ACP initialization: https://agentclientprotocol.com/protocol/v1/initialization
- ACP session setup: https://agentclientprotocol.com/protocol/v1/session-setup
- ACP prompt turn: https://agentclientprotocol.com/protocol/v1/prompt-turn
- ACP content: https://agentclientprotocol.com/protocol/v1/content
- ACP tool calls: https://agentclientprotocol.com/protocol/v1/tool-calls
- ACP filesystem: https://agentclientprotocol.com/protocol/v1/file-system
- ACP plan updates: https://agentclientprotocol.com/protocol/v1/agent-plan
- ACP v2 draft: https://agentclientprotocol.com/rfds/v2/overview
- ACP Rust library: https://agentclientprotocol.com/libraries/rust
- Zed external agents docs: https://zed.dev/docs/ai/external-agents
- Zed ACP launch blog: https://zed.dev/blog/bring-your-own-agent-to-zed
- Zed ACP source roots:
  https://github.com/zed-industries/zed/tree/main/crates/acp_thread and
  https://github.com/zed-industries/zed/blob/main/crates/agent_servers/src/acp.rs

ACP standardizes a JSON-RPC 2.0 client-agent boundary. The current v1 transport
is primarily newline-delimited UTF-8 JSON-RPC over stdio, with streamable HTTP
still draft. It standardizes initialization, version and capability negotiation,
authentication hooks, session creation/load/resume, prompt turns, update
notifications, content blocks, tool-call status, permission requests,
cancellation, JSON-RPC errors, and optional client-provided filesystem and
terminal capabilities.

The protocol is not a backend workflow engine. It does not define semantic
document identity, approval policy, invariant checks, conflict strategy, durable
run state, graph rebuild behavior, or commit/publish semantics. In Zed, ACP's
client is the editor UI and the external agent owns runtime, auth, model
selection, tools, and native config. Zed hosts the thread, displays streamed
messages/tool calls/diffs, forwards MCP where configured, and exposes editor
resources where capabilities allow it.

For Vaultspec, the transferable part is the event vocabulary and lifecycle:
session, prompt turn, plan, message chunk, tool-call update, permission request,
cancel, stop reason, and resumable state replay. The non-transferable part is
ACP's code-editor assumption that files and terminal execution are primary
client capabilities. Vaultspec should treat document edits as semantic proposals
against `doc:` identities and vaultspec-core verbs, not as arbitrary
`fs/write_text_file` operations against absolute paths.

Adopt, adapt, reject:

| Item | Verdict | Reason |
| --- | --- | --- |
| JSON-RPC-style envelope semantics for agent bridge | Adapt | Useful for Rust-to-LangGraph process or websocket bridge; browser API should keep existing HTTP/SSE envelope. |
| Stdio agent subprocess transport | Adapt | Good for local agent adapters; not the browser/frontend transport. Existing backend already has HTTP plus SSE. |
| Initialize/capability negotiation | Adopt | Backend must know which agent features are available: embedded context, approval kinds, cancel, replay, semantic patch support. |
| Sessions and prompt turns | Adopt | Fits long-lived authoring runs and isolates concurrent document work. |
| `session/update` streaming shape | Adapt | Use the idea, but emit Vaultspec domain events over `/stream` or a new authoring stream. |
| Message chunks with IDs | Adopt | Needed for stable transcript replay and partial rendering. |
| Plan updates | Adapt | ACP v1 replaces the whole plan; Vaultspec should expose durable wave/phase/step authoring state and use item-level updates where possible. ACP v2 moves in that direction. |
| Tool-call lifecycle and statuses | Adopt | Useful UI model for agent actions such as read context, propose patch, validate, request approval, apply. |
| Permission request/options | Adapt | Core idea fits approval gates, but options must be semantic and scoped: approve once, approve run, reject, revise; not generic tool allow/deny. |
| `fs/read_text_file` | Adapt | Agents may need read access, but backend should serve bounded document resources by node/doc id and revision, not arbitrary absolute path reads. |
| `fs/write_text_file` | Reject for core workflow | Too low-level and path-centric. Use semantic proposals plus approved vaultspec-core mutations. |
| Terminal execution surface | Reject for authoring | Not relevant to semantic document editing; v2 draft also removes v1 client filesystem and terminal surfaces. |
| Diff content shape | Adapt | Useful display primitive, but add semantic patch metadata: doc id, section/frontmatter/body operation, base revision, validation result. |
| Cancellation model | Adopt | Cancel must mark pending approvals cancelled, abort LangGraph work, and end the run with a non-error cancelled status. |
| JSON-RPC errors | Adapt | Keep machine error kinds; map to existing Vaultspec tiers-bearing HTTP errors and run events. |
| ACP registry/custom agents | Reject for now | Useful ecosystem feature for editors; Vaultspec should first define first-party backend-agent contract. |

Architecture decisions implied for Vaultspec:

1. Treat ACP as inspiration for the backend-to-agent protocol, not the
   frontend-to-backend API. The browser should continue to consume authenticated
   HTTP and resumable SSE; LangGraph/agent adapters can speak ACP-like JSON-RPC
   or an internal Rust trait.
2. Define a durable `authoring_session` aggregate separate from dashboard
   `/session`: session id, scope, actor, target documents, transcript, plan,
   pending approvals, run status, base graph generation, and last emitted seq.
3. Define a `prompt_turn` lifecycle: create turn, stream updates, request
   approval, cancel, complete with stop reason. Stop reasons should include
   `end_turn`, `cancelled`, `rejected`, `validation_failed`, `conflict`,
   `max_steps`, and `error`.
4. Represent agent work as tool-call records, but with Vaultspec tool kinds:
   `read_context`, `search_graph`, `propose_document_patch`, `validate`,
   `request_approval`, `apply_mutation`, `reindex`, and `publish_summary`.
5. Make approval a backend workflow concern. The frontend renders approvals and
   returns decisions; the backend enforces policy, tracks expiry/cancellation,
   applies only approved proposals, and records audit data.
6. Make edits semantic proposals, not writes. Proposal payloads should target
   `doc_id` or `doc_ref`, carry a base content hash or graph generation, and use
   operations such as `set_body`, `set_frontmatter`, `edit_section`,
   `add_related`, and `create_doc`.
7. Preserve ACP-style display diffs as derived artifacts. Diffs are for user
   review; the authoritative mutation is the semantic proposal and the
   vaultspec-core result envelope.
8. Add authoring-specific endpoints rather than overloading `/ops/core/*`:
   `POST /authoring/sessions`, `GET /authoring/sessions/{id}`,
   `POST /authoring/sessions/{id}/prompt`,
   `POST /authoring/sessions/{id}/cancel`,
   `GET /authoring/sessions/{id}/events`,
   `POST /authoring/approvals/{id}/decision`,
   `GET /authoring/proposals/{id}`,
   `POST /authoring/proposals/{id}/apply`.
9. Stream authoring events either on a new channel in `/stream` or a scoped
   authoring event endpoint. Events should be resumable by monotonic seq and
   include `message_chunk`, `plan_update`, `tool_call_upsert`,
   `approval_requested`, `approval_resolved`, `proposal_created`,
   `validation_result`, `mutation_applied`, `turn_completed`, `cancelled`, and
   `error`.
10. Keep existing `/ops/core/{verb}/write` as the low-level broker, but make
    authoring apply through a higher-level service that validates semantic
    proposals, calls the whitelisted core verb, captures the sibling envelope,
    and waits for watcher/reindex convergence.
11. Implement capability negotiation for agent adapters, but avoid exposing
    raw filesystem or terminal capabilities as frontend privileges.
12. Version the authoring event/proposal schema now. ACP v2 draft shows churn
    around filesystem, terminal, plan updates, message updates, and tool-call
    streaming, so Vaultspec should avoid binding core storage to ACP v1 shapes.
