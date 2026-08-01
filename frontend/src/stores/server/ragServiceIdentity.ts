// The index console's IDENTITY projection (advanced-service-console ADR D4): who
// the attached indexing tool is, what version is installed, where its store
// lives, and how much it holds — the facts the console's header states so the
// operator never has to guess which process the controls are driving.
//
// SOURCES, all three already on the wire; this module adds no read and no
// coupling:
//   1. the `semantic` tier's COMPONENT HANDSHAKE (`tiers.semantic.component`) —
//      the engine's own served `{name, floor, version}` for the sibling tool;
//   2. the brokered Tier-1 `ops-state` snapshot (`/ops/rag/ops-state`), whose
//      `index` and `qdrant` blocks the engine forwards VERBATIM from the tool's
//      own `/service-state`;
//   3. the served provisioning projection (`/provision/status`), which carries
//      the INSTALLED tool version the handshake does not report.
// All are codified-contract reads (rag-integration Tier 1). Nothing here reads
// Qdrant's REST API, and nothing recomputes the collection-naming scheme.
//
// HONEST GAPS, rendered as gaps rather than invented: the handshake reports the
// running `version` as `null` today (the discovery record is not a served
// route), so the header states the INSTALLED version instead and says nothing
// about a running one. The tool's own listening port and pid are likewise not on
// the wire; what IS served is its STORE's address, process, and version, so
// those are what the header names.

import { useMemo } from "react";

import type { TierComponent } from "./engine";
import { readTierAvailability, tiersFromQuery } from "./engine";
import { useProvisionStatus } from "./provisionControl";
import { useEngineStatus } from "./queries/internal";
import {
  normalizeRagControlScope,
  ragQuerySemanticOffline,
  useRagOpsState,
  type RagOpsStateEnvelope,
} from "./ragControl";

/** The semantic tier is the one the indexing tool rides on. */
const SERVICE_TIER = "semantic";

/** Longest served identity string the console will render — a bound on every
 *  free-form value the tool hands us (bounded-by-default). */
export const RAG_IDENTITY_TEXT_MAX_CHARS = 512;

/** The interpreted identity facts the console header renders. Every field is
 *  `null` when the wire did not carry it; the view never substitutes one fact for
 *  another. */
export interface RagServiceIdentityView {
  /** The tool's own served name (the component handshake). */
  name: string | null;
  /** The running version the handshake reports, or `null` when it reports none. */
  version: string | null;
  /** The installed version the provisioning projection reports. */
  installedVersion: string | null;
  /** The minimum version the dashboard declares support for (the served floor). */
  requiredVersion: string | null;
  /** The store's backing mode word (`server` / `local` / `remote`). */
  storageMode: string | null;
  /** The store's served address (host:port form). */
  storageEndpoint: string | null;
  /** The store process's served pid. */
  storageProcessId: number | null;
  /** The store's served version. */
  storageVersion: string | null;
  /** The store's served on-disk location (or its address in server mode). */
  storagePath: string | null;
  /** Indexed document count, as served. */
  documents: number | null;
  /** Indexed code-chunk count, as served. */
  code: number | null;
  /** No identity fact at all was served. */
  empty: boolean;
}

function identityText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= RAG_IDENTITY_TEXT_MAX_CHARS
    ? trimmed
    : null;
}

function identityNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function block(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Derive the identity view from the served component handshake, the brokered
 * ops-state envelope, and the served installed version. Pure and tolerant: a
 * tool-side shape change drops the fields it renamed rather than throwing, which
 * is the honest degradation the brokered envelopes are documented to allow.
 */
export function deriveRagServiceIdentity(
  component: TierComponent | undefined,
  envelope: RagOpsStateEnvelope | null | undefined,
  installedVersion?: unknown,
): RagServiceIdentityView {
  const index = block(envelope?.index);
  const qdrant = block(envelope?.qdrant);
  const view: RagServiceIdentityView = {
    name: identityText(component?.name),
    version: identityText(component?.version),
    installedVersion: identityText(installedVersion),
    requiredVersion: identityText(component?.floor),
    storageMode: identityText(qdrant?.mode),
    storageEndpoint: identityText(qdrant?.url),
    storageProcessId: identityNumber(qdrant?.pid),
    storageVersion: identityText(qdrant?.version),
    storagePath: identityText(index?.storage_path),
    documents: identityNumber(index?.vault_count),
    code: identityNumber(index?.code_count),
    empty: false,
  };
  const carried =
    view.name !== null ||
    view.version !== null ||
    view.installedVersion !== null ||
    view.requiredVersion !== null ||
    view.storageMode !== null ||
    view.storageEndpoint !== null ||
    view.storageProcessId !== null ||
    view.storageVersion !== null ||
    view.storagePath !== null ||
    view.documents !== null ||
    view.code !== null;
  return { ...view, empty: !carried };
}

/** The identity view plus the query state the console renders its modes from. */
export interface RagServiceIdentityHookView {
  identity: RagServiceIdentityView;
  /** The ops-state read is in flight with nothing held. */
  loading: boolean;
  /** The semantic tier reports unavailable — read from tiers, never guessed. */
  offline: boolean;
}

/**
 * Stores hook: the console's identity view. Mount-gated with the console it
 * serves (these reads only run while the Advanced index console is expanded),
 * and derived in one `useMemo` over the raw slices it reads
 * (frontend-store-selectors).
 */
export function useRagServiceIdentity(scope: unknown): RagServiceIdentityHookView {
  const normalizedScope = normalizeRagControlScope(scope);
  const status = useEngineStatus();
  const opsState = useRagOpsState(normalizedScope);
  const provision = useProvisionStatus();

  const component = readTierAvailability(tiersFromQuery(status), [SERVICE_TIER])
    .components?.[SERVICE_TIER];
  const envelope = opsState.data?.envelope;
  const installedVersion = provision.data?.rag.tool_version ?? null;

  const identity = useMemo(
    () => deriveRagServiceIdentity(component, envelope, installedVersion),
    [component, envelope, installedVersion],
  );
  return {
    identity,
    loading: opsState.isPending,
    offline: ragQuerySemanticOffline(opsState),
  };
}
