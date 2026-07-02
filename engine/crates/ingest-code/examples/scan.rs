//! Extraction smoke-runner: `cargo run -p ingest-code --example scan -- <root>`
//! Prints the stats block and a small sample of nodes/edges — the quickest way
//! to eyeball extraction quality against a real repository.

use ingest_code::{WalkCaps, extract_code_graph};

fn main() {
    let root = std::env::args().nth(1).unwrap_or_else(|| ".".to_string());
    let started = std::time::Instant::now();
    let data =
        extract_code_graph(std::path::Path::new(&root), &WalkCaps::default()).expect("walk failed");
    let elapsed = started.elapsed();

    println!("stats: {:#?}", data.stats);
    println!("fingerprint: {}", data.fingerprint);
    println!("nodes: {}  edges: {}", data.nodes.len(), data.edges.len());
    println!("wall: {elapsed:?}");

    let imports = data
        .edges
        .iter()
        .filter(|e| e.edge.relation == engine_model::RelationKind::Imports)
        .count();
    let contains = data.edges.len() - imports;
    println!("imports: {imports}  contains: {contains}");

    println!("\nsample import edges:");
    for e in data
        .edges
        .iter()
        .filter(|e| e.edge.relation == engine_model::RelationKind::Imports)
        .take(12)
    {
        println!(
            "  {} -> {} (x{})",
            e.edge.src.0, e.edge.dst.0, e.multiplicity
        );
    }
    println!("\nsample modules:");
    for n in data
        .nodes
        .iter()
        .filter(|n| n.id.0.starts_with("code-mod:"))
        .take(12)
    {
        println!("  {}", n.id.0);
    }
}
