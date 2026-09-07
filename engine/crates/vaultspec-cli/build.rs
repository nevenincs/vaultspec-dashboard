#[path = "../../build/windows_resources.rs"]
mod windows_resources;

fn main() {
    windows_resources::embed_application_resources(None);
}
