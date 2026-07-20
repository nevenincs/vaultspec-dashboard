use super::*;

fn proven() -> ProvenManager {
    ProvenManager::prove(std::env::current_exe().unwrap()).expect("test binary is a real file")
}

fn artifact() -> PinnedArtifact {
    PinnedArtifact::new("vaultspec-desktop@0.1.0", "a".repeat(64)).unwrap()
}

#[test]
fn reports_scoop_channel_facts() {
    let adapter = ScoopAuthority::new();
    assert_eq!(adapter.channel(), Channel::Scoop);
    assert!(adapter.manager_owns_activation());
    let provenance = adapter.provenance();
    assert_eq!(provenance.channel(), Channel::Scoop);
    assert!(provenance.manager_owns_activation());
}

#[test]
fn authorizes_each_closed_operation_against_a_proven_manager() {
    let adapter = ScoopAuthority::new();
    let proven = proven();
    let artifact = artifact();
    for (op, label) in [
        (ScoopOperation::Install, "scoop-install"),
        (ScoopOperation::Update, "scoop-update"),
        (ScoopOperation::Uninstall, "scoop-uninstall"),
    ] {
        let authorized = adapter.authorize(&proven, op, &artifact);
        assert_eq!(authorized.channel(), Channel::Scoop);
        assert_eq!(authorized.operation(), label);
        assert_eq!(authorized.program(), proven.program());
        assert_eq!(authorized.artifact(), &artifact);
    }
}

#[test]
fn proving_an_absent_manager_fails() {
    assert!(ProvenManager::prove("/no/such/scoop/binary/anywhere").is_none());
}
