//! The network-isolation precondition every offline case rests on.

use std::net::{SocketAddr, TcpStream, ToSocketAddrs};

use crate::{
    EvidenceGap, ISOLATION_PROBE_ENDPOINTS, ISOLATION_PROBE_NAME, ISOLATION_PROBE_TIMEOUT,
};

// Network isolation
// ---------------------------------------------------------------------------

/// Prove this host has no outbound reach. A case that certifies offline
/// behaviour must not run on a networked host: a success there would prove
/// nothing about the offline property.
pub(crate) fn require_network_removed() -> Result<(), EvidenceGap> {
    for endpoint in ISOLATION_PROBE_ENDPOINTS {
        let address: SocketAddr = endpoint
            .parse()
            .expect("the probe endpoints are literal socket addresses");
        if TcpStream::connect_timeout(&address, ISOLATION_PROBE_TIMEOUT).is_ok() {
            return Err(EvidenceGap::NetworkReachable {
                endpoint: endpoint.to_string(),
            });
        }
    }
    if ISOLATION_PROBE_NAME.to_socket_addrs().is_ok() {
        return Err(EvidenceGap::NetworkReachable {
            endpoint: format!("{ISOLATION_PROBE_NAME} (name resolution)"),
        });
    }
    Ok(())
}

// ---------------------------------------------------------------------------
