/** The narrow happy-dom teardown capability owned by the test harness. */
export interface HappyDOMAbort {
  abort(): Promise<void>;
}

/** Cancel pending happy-dom work and wait for its cleanup microtasks to settle. */
export async function abortHappyDOM(
  happyDOM: HappyDOMAbort | undefined,
): Promise<void> {
  await happyDOM?.abort();
}
