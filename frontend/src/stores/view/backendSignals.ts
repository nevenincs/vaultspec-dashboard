import { useBackendSignalStream } from "../server/queries";

/**
 * Mount the shared backend/git signal subscription for the application shell.
 * The shell owns the lifetime, but the stream hook itself stays behind this
 * named view seam so app chrome does not subscribe to raw engine streams.
 */
export function useBackendSignalSubscription(): void {
  useBackendSignalStream();
}
