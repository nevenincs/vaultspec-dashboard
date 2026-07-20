use super::*;

fn proven() -> ProvenManager {
    ProvenManager::prove(std::env::current_exe().unwrap()).expect("test binary is a real file")
}

fn artifact() -> PinnedArtifact {
    PinnedArtifact::new("vaultspec-desktop-0.1.0.msi", "c".repeat(64)).unwrap()
}

#[test]
fn reports_msi_channel_facts() {
    let adapter = MsiAuthority::new();
    assert_eq!(adapter.channel(), Channel::Msi);
    assert!(adapter.manager_owns_activation());
    let provenance = adapter.provenance();
    assert_eq!(provenance.channel(), Channel::Msi);
    assert!(provenance.manager_owns_activation());
}

#[test]
fn authorizes_the_full_closed_installer_operation_set() {
    let adapter = MsiAuthority::new();
    let proven = proven();
    let artifact = artifact();
    for (op, label) in [
        (MsiOperation::Install, "msi-install"),
        (MsiOperation::Upgrade, "msi-upgrade"),
        (MsiOperation::Downgrade, "msi-downgrade"),
        (MsiOperation::Rollback, "msi-rollback"),
        (MsiOperation::Repair, "msi-repair"),
        (MsiOperation::Remove, "msi-remove"),
    ] {
        let authorized = adapter.authorize(&proven, op, &artifact);
        assert_eq!(authorized.channel(), Channel::Msi);
        assert_eq!(authorized.operation(), label);
        assert_eq!(authorized.program(), proven.program());
        assert_eq!(authorized.artifact(), &artifact);
    }
}
