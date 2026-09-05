# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are developers and technical leads working in Vaultspec-managed Git repositories. They use the dashboard when they need to read, navigate, understand, author, or review the records and source material behind a feature without losing its project and worktree context.

## Product Purpose

vaultspec-dashboard is the human-facing reader and visual workspace for a Vaultspec project. It makes the repository's structured Markdown records, source files, Git history, relationships, plans, activity, and supporting search available in one local web interface.

Success means a user can orient themselves in a project, follow a feature's recorded trail, inspect the relevant documents and code, and safely continue review or approved authoring work from the same workspace.

## Positioning

The dashboard reads the same Git-backed Vaultspec material that the coding harness and command-line tools operate on. It connects feature records, source files, history, graph relationships, search, and approval-gated authoring without creating a parallel project model or requiring hosted project data.

## Operating Context

- A user opens a local Git project or switches among registered projects and worktrees.
- The workspace keeps Vault documents, repository files, graph relationships, timeline context, and activity visible as connected views of the same project.
- Users follow a feature through Vaultspec's Research, Decide, Plan, Code, and Review records, all joined by feature identity and document relationships.
- Semantic search attaches to the machine-wide vaultspec-rag service when available. Literal name search and unaffected workspace capabilities remain usable without it.
- The application runs as a local web interface served by the Vaultspec engine. A single seated application instance can manage multiple known projects; development and test serves are explicitly separate.

## Capabilities and Constraints

- Browse structured Vaultspec records and repository source files.
- Inspect Markdown documents and read-only highlighted source code.
- Explore bounded Vault and code relationship graphs, with timeline, filtering, selection, and minimap context on supported desktop layouts.
- Search documents and code using semantic and literal matching, with bounded results.
- Monitor open plans, changes, commits, pull requests, issues, approvals, reviews, and service health.
- Edit and rename Vault Markdown only through the approved authoring path when authoring is available; source-code editing is not a dashboard capability.
- Preserve one backend-served project model across views. The frontend presents served state and does not invent status, classification, counts, or degradation.
- Degrade by capability: a missing search, GitHub, graphics, relationship, or authoring dependency must not take down unaffected reading and navigation.
- Keep project content local and Git-backed. Engine caches and machine discovery state are operational support, not competing sources of product truth.
- The graph is a desktop capability and is not available in compact or mobile layouts.

## Brand Commitments

- Product name: `vaultspec-dashboard`; family name: Vaultspec.
- Family positioning: Vaultspec is a decision-driven coding harness for coding agents and humans, organized around features, decision records, and the documents grounding them.
- Dashboard role: the human-facing Vaultspec reader and visual workspace.
- Use the established Vaultspec vocabulary for Research, Decision/ADR, Plan, Code/Execution, Review/Audit, feature, vault, project, and worktree.
- Preserve the existing Vaultspec and dashboard identity assets, including `docs/assets/logo.png` and the application icon assets already shipped by the product.
- The product is actively developed, MIT licensed, and currently beta.

## Evidence on Hand

- `README.md` is the dashboard's current user-facing capability, installation, workflow, degradation, status, and support reference.
- `docs/application-runtime.md` documents the current application lifecycle, single-instance behavior, project selection, and local storage boundaries.
- `docs/assets/` contains current product screenshots and identity assets used by the README.
- `frontend/figma/` and `frontend/tokens/` contain the binding design-system documentation and token workflow for later visual work.
- The live Vaultspec site and documentation at `http://gw-workstation:4300/` and `http://gw-workstation:4300/dev/docs/index.html` provide the approved family positioning, pipeline vocabulary, component boundaries, and user guidance.
- No testimonials, customer claims, usage benchmarks, pricing claims, or hosted-service claims are established; future work must not fabricate them.

## Product Principles

- Keep the feature trail legible: help people move from a project question to its grounding, decision, plan, implementation record, and review.
- Show one project truth across every view: documents, code, history, graph, timeline, search, and activity must stay connected rather than becoming separate interpretations.
- Preserve human authority: approval gates and authoring boundaries remain explicit even when agents perform the work.
- Fail in parts, not as a whole: keep unaffected reading, browsing, and navigation available when an optional dependency degrades.
- Stay local and inspectable: operate on repository-backed material that users can also read, diff, and review with their existing tools.
