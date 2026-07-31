// Make the review page HERMETIC: no request this document issues ever reaches a
// network, so the desk cannot go blank — or silently flip a cell's state — because an
// engine is slow, absent, or holding connections.
//
// Specimens are authored props, so nothing here is expected to touch the wire at all.
// But a production component mounted standalone may still carry a hook that fires a
// fetch or opens a live stream. Letting that escape would reintroduce exactly the
// dependency this desk exists to remove — and a FAILED request is worse than none,
// because it flips the component into its error path and corrupts the authored state
// under review. A request that never settles is the honest answer: the component
// shows its own pending treatment, and the console names what tried to reach out.
//
// Imported for its side effects as the FIRST module of the entry, before any
// production module can capture the real bindings.
//
// Vite's HMR client uses a WebSocket, which is deliberately left alone.

const pendingForever = (input: RequestInfo | URL): Promise<Response> => {
  console.debug(
    `[visual-review] fetch intercepted (the desk is hermetic): ${String(input)}`,
  );
  return new Promise<Response>(() => {});
};

window.fetch = pendingForever as typeof window.fetch;

/** An EventSource that never connects and never emits: a live stream with no wire. */
class InertEventSource extends EventTarget {
  static readonly CONNECTING = 0 as const;
  static readonly OPEN = 1 as const;
  static readonly CLOSED = 2 as const;
  readonly CONNECTING = 0 as const;
  readonly OPEN = 1 as const;
  readonly CLOSED = 2 as const;
  readonly readyState = 0;
  readonly url: string;
  readonly withCredentials: boolean;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
  onopen: ((this: EventSource, ev: Event) => unknown) | null = null;

  constructor(url: string | URL, init?: EventSourceInit) {
    super();
    this.url = String(url);
    this.withCredentials = init?.withCredentials ?? false;
    console.debug(
      `[visual-review] EventSource intercepted (the desk is hermetic): ${this.url}`,
    );
  }

  close(): void {}
}

window.EventSource = InertEventSource as unknown as typeof EventSource;
