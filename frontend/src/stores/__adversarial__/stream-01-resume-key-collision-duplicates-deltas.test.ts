// Adversarial — live data plane lens: SSE stream resume / cache invalidation.
//
// Target: src/stores/server/queries.ts — engineKeys.stream + engineStreamOptions.
//
// STATED CONTRACT (queries.ts header, lines 1-8): "cache keys carry
// (scope, filter, as-of) because the contract makes scope fully stateless —
// responses are cacheable by exactly that triple and two scopes never
// interfere." The graph key proves the discipline by folding `asOf` into the
// key (engineKeys.graph). The contract's identity guarantee (§2, see
// .claude/rules/provenance-stable-keys-are-identity-bearing) is that the GUI
// caches/animates by id and a cached entry must be identified by everything
// that changes its content.
//
// DEFECT: engineKeys.stream(channels) omits the resume point `since`, so two
// distinct resumes over the same channel collide on ONE cache entry. Combined
// with engineStreamOptions' unconditional refetchMode:"append" + retry:true, a
// reconnect/refetch (the normal path after a dropped SSE connection, or a
// React-Query invalidation) RE-APPENDS the replayed `since=` window onto the
// already-accumulated cache — the live client model accumulates DUPLICATE
// graph deltas. The since= replay is supposed to splice idempotently (§7); here
// it duplicates.

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { MockEngine } from "../../testing/mockEngine";
import { engineClient } from "../server/engine";
import { engineStreamOptions } from "../server/queries";

interface GraphChunk {
  channel: string;
  data: { seq: number };
}

describe("stream resume cache key (live data plane)", () => {
  it("a resume point must change the cache key (mirroring graph's as-of)", () => {
    // engineKeys.graph folds as-of into the key so a live and a historical
    // slice never collide. The stream key must likewise distinguish two
    // resume offsets — they carry genuinely different delta windows.
    const fresh = engineStreamOptions(["graph"]); // initial connect (no since)
    const resumed = engineStreamOptions(["graph"], 42); // reconnect from seq 42
    expect(JSON.stringify(resumed.queryKey)).not.toBe(JSON.stringify(fresh.queryKey));
  });

  it("a reconnect must not duplicate the replayed since= delta window", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    const qc = new QueryClient();

    const lastSeq = mock.lastSeq;
    // Initial connect resumes from lastSeq-3, so the mock replays exactly the
    // last three graph deltas (seqs lastSeq-2, lastSeq-1, lastSeq).
    const opts = engineStreamOptions(["graph"], lastSeq - 3);
    void qc.fetchQuery(opts);
    await new Promise((r) => setTimeout(r, 30));

    const before = (qc.getQueryData(opts.queryKey) as GraphChunk[] | undefined) ?? [];
    const seqsBefore = before.map((c) => c.data.seq);
    expect(seqsBefore).toEqual([lastSeq - 2, lastSeq - 1, lastSeq]);

    // The SSE connection drops; TanStack reconnects (refetch). The since=
    // window replays again. The contract's idempotent splice (§7) means the
    // client model must converge — the replayed deltas are already held, so a
    // correct splice yields NO new deltas, never a second copy.
    await qc.refetchQueries({ queryKey: opts.queryKey });
    await new Promise((r) => setTimeout(r, 30));

    const after = (qc.getQueryData(opts.queryKey) as GraphChunk[] | undefined) ?? [];
    const seqsAfter = after.map((c) => c.data.seq);

    // CONTRACT-CORRECT: a delta seq appears at most once in the live model.
    const counts = new Map<number, number>();
    for (const seq of seqsAfter) counts.set(seq, (counts.get(seq) ?? 0) + 1);
    const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([s]) => s);
    expect(duplicated).toEqual([]);
  });
});
