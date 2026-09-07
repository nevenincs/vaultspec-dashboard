use std::path::{Path, PathBuf};

fn manifest_dir() -> PathBuf {
    PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("cargo sets CARGO_MANIFEST_DIR"))
}

pub fn embed_application_resources(manifest_name: Option<&str>) {
    let target = std::env::var("TARGET").expect("cargo sets TARGET for every build");
    if !target.ends_with("windows-msvc") {
        return;
    }

    let crate_dir = manifest_dir();
    let icon = crate_dir.join("../../assets/vaultspec.ico");
    println!("cargo:rerun-if-changed={}", icon.display());

    let mut resources = winresource::WindowsResource::new();
    resources.set_icon(required_utf8(&icon));

    if let Some(name) = manifest_name {
        let manifest = crate_dir.join(name);
        println!("cargo:rerun-if-changed={}", manifest.display());
        resources.set_manifest_file(required_utf8(&manifest));
    }

    resources
        .compile()
        .expect("compile the governed Windows application resources");
}

fn required_utf8(path: &Path) -> &str {
    path.to_str()
        .expect("Windows resource paths must be representable as UTF-8")
}
