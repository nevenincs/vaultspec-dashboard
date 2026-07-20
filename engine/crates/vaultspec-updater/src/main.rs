//! Entry point for the copied external updater executable (a2a-product-provisioning
//! W03.P07). The full flow — parse the one-time owner-restricted descriptor
//! outside the active release, acquire the installation lock before any drain or
//! mutation, execute or recover the ordered transaction, redact secrets, and
//! return bounded diagnostics — is wired in S59.
//!
//! Until then the executable refuses (exit code 2): with no descriptor-driven run
//! wired, it performs no mutation rather than exiting success having done nothing.

fn main() {
    std::process::exit(2);
}
