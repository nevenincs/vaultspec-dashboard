import { beforeEach, describe, expect, it } from "vitest";

import {
  currentOpsReceiptEpoch,
  opsReceiptSnapshot,
  resetOpsReceipt,
  setOpsReceiptForEpoch,
} from "./opsReceipt";

describe("ops receipt seam", () => {
  beforeEach(() => resetOpsReceipt());

  it("stores receipts only for the current epoch", () => {
    const epoch = currentOpsReceiptEpoch();

    setOpsReceiptForEpoch(epoch, {
      verb: "vault-stats",
      text: "completed",
      tone: "ok",
    });
    expect(opsReceiptSnapshot()).toMatchObject({
      verb: "vault-stats",
      text: "completed",
      tone: "ok",
    });

    resetOpsReceipt();
    setOpsReceiptForEpoch(epoch, {
      verb: "stale",
      text: "must not resurrect",
      tone: "failed",
    });

    expect(opsReceiptSnapshot()).toBeNull();
  });
});
