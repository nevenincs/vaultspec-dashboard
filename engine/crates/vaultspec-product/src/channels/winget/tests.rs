use super::*;

fn proven() -> ProvenManager {
    ProvenManager::prove(std::env::current_exe().unwrap()).expect("test binary is a real file")
}

fn artifact() -> PinnedArtifact {
    PinnedArtifact::new("Vaultspec.Desktop", "b".repeat(64)).unwrap()
}

#[test]
fn reports_winget_channel_facts() {
    let adapter = WinGetAuthority::new();
    assert_eq!(adapter.channel(), Channel::WinGet);
    assert!(adapter.manager_owns_activation());
    let provenance = adapter.provenance();
    assert_eq!(provenance.channel(), Channel::WinGet);
    assert!(provenance.manager_owns_activation());
}

#[test]
fn authorizes_each_closed_operation_against_a_proven_manager() {
    let adapter = WinGetAuthority::new();
    let proven = proven();
    let artifact = artifact();
    for (op, label) in [
        (WinGetOperation::Install, "winget-install"),
        (WinGetOperation::Upgrade, "winget-upgrade"),
        (WinGetOperation::Uninstall, "winget-uninstall"),
    ] {
        let authorized = adapter.authorize(&proven, op, &artifact);
        assert_eq!(authorized.channel(), Channel::WinGet);
        assert_eq!(authorized.operation(), label);
        assert_eq!(authorized.program(), proven.program());
        assert_eq!(authorized.artifact(), &artifact);
    }
}
