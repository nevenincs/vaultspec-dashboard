//! The one pair of ceilings on semantic-search INPUT.
//!
//! Two surfaces sit in front of the SAME rag search invocation, and they are not
//! alternatives — they are two halves of one contract:
//!
//! - `routes::ops` ENFORCES these on the public `/search` route, rejecting an
//!   unbounded external caller before any rag argv is built.
//! - `authoring::tools` ADVERTISES them in the `search_graph` tool catalog and
//!   pre-validates against them. That tool never runs a search itself: a
//!   read-only tool returns a prepared read descriptor and the caller pulls the
//!   read through the route above.
//!
//! So a drift between the two is not two surfaces disagreeing about their own
//! limits — it is the catalog advertising a bound the route does not honour, and
//! an agent that believes the catalog gets rejected at the boundary for asking
//! exactly what it was told it could ask for. They are single-sourced here so
//! that cannot happen.

/// Longest accepted search query, in CHARACTERS rather than bytes, so a
/// multi-byte query is not rejected for a length the user did not type.
pub(crate) const MAX_SEARCH_QUERY_CHARS: usize = 512;

/// Most results a caller may explicitly request. Omitting a count lets rag apply
/// its own default; only an explicit request above this is refused.
pub(crate) const MAX_SEARCH_RESULTS: u32 = 50;
