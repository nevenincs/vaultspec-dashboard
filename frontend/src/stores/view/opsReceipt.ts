import { useEffect } from "react";
import { create } from "zustand";

import type { OpsReceipt } from "../server/queries";

interface OpsReceiptState {
  receipt: OpsReceipt | null;
  epoch: number;
  reset: () => void;
  setForEpoch: (epoch: number, receipt: OpsReceipt) => void;
}

const useOpsReceiptStore = create<OpsReceiptState>((set) => ({
  receipt: null,
  epoch: 0,
  reset: () => set((state) => ({ receipt: null, epoch: state.epoch + 1 })),
  setForEpoch: (epoch, receipt) =>
    set((state) => (state.epoch === epoch ? { receipt } : state)),
}));

export function useOpsReceipt(): OpsReceipt | null {
  return useOpsReceiptStore((state) => state.receipt);
}

export function currentOpsReceiptEpoch(): number {
  return useOpsReceiptStore.getState().epoch;
}

export function opsReceiptSnapshot(): OpsReceipt | null {
  return useOpsReceiptStore.getState().receipt;
}

export function resetOpsReceipt(): void {
  useOpsReceiptStore.getState().reset();
}

export function setOpsReceiptForEpoch(epoch: number, receipt: OpsReceipt): void {
  useOpsReceiptStore.getState().setForEpoch(epoch, receipt);
}

/**
 * Reset transient operation receipts when their validity context changes.
 *
 * Receipts describe the operation outcome for one corpus and one operation mode.
 * A scope swap or transition into/out of read-only history invalidates the text,
 * and also bumps the epoch so late mutation callbacks cannot resurrect it.
 */
export function useOpsReceiptBoundary(scope: string | null, timeTravel: boolean): void {
  useEffect(() => {
    resetOpsReceipt();
  }, [scope, timeTravel]);
}
