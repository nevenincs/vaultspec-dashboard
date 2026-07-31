//! The process-wide graceful-shutdown latch.
//!
//! Split out of `app.rs`: it shares no state with the scope registry or the
//! serve state around it, and its correctness argument is entirely its own —
//! worth reading without a thousand lines of unrelated context above it.

/// The process-wide graceful-shutdown latch.
///
/// A LATCH, not a notification: once raised it stays raised, and a waiter that
/// subscribes AFTER the raise resolves immediately. That property is what makes
/// the drain finish. An endless response body (the graph SSE stream, the A2A run
/// relay) is opened at an arbitrary moment and must end when the process is
/// stopping; with a one-shot notification the permit is consumed by whoever
/// waits first — every stream opened before the signal (or subscribing after it)
/// would keep its connection open forever, so `axum::serve`'s graceful shutdown
/// never completes, the caller's bounded wait expires, and the process is
/// force-killed WITH IN-FLIGHT CONNECTIONS ATTACHED — client-visible as a
/// dropped socket on requests that had nothing to do with the stop.
///
/// Backed by a `watch` channel because it keeps the raised value for late
/// subscribers and never fails on a send (`send_replace` ignores the
/// receiver count), so raising the latch cannot depend on who is listening.
pub struct ShutdownSignal {
    tx: tokio::sync::watch::Sender<bool>,
}

impl Default for ShutdownSignal {
    fn default() -> Self {
        Self {
            tx: tokio::sync::watch::channel(false).0,
        }
    }
}

impl ShutdownSignal {
    /// Raise the latch. Idempotent: a repeated raise while draining is a no-op
    /// beyond re-publishing the same value.
    pub fn signal(&self) {
        self.tx.send_replace(true);
    }

    /// Whether the latch is raised (a cheap, non-blocking read).
    pub fn is_signalled(&self) -> bool {
        *self.tx.borrow()
    }

    /// Await the latch, resolving immediately when it is ALREADY raised.
    pub async fn wait(&self) {
        self.waiter().await;
    }

    /// An OWNED future that resolves when the latch is raised — the form a
    /// response body needs, since a streaming body outlives the handler's
    /// borrow of the state. Used to terminate endless SSE bodies at shutdown.
    // `use<>`: capture NOTHING from `&self` (edition 2024 would otherwise infer
    // the borrow into the opaque type), so the returned future is genuinely
    // owned and can ride a response body that outlives this borrow.
    pub fn waiter(&self) -> impl std::future::Future<Output = ()> + Send + 'static + use<> {
        let mut rx = self.tx.subscribe();
        async move {
            // `wait_for` checks the CURRENT value first, so a waiter created
            // after the raise returns without awaiting anything.
            let _ = rx.wait_for(|raised| *raised).await;
        }
    }
}
