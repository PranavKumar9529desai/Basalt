use std::fs;
use std::time::Instant;
use basalt_core::parse_markdown;

fn main() {
    println!("Loading Markdown file...");
    let input = fs::read_to_string("/home/pranav/Projects/Basalt/basalt_core/examples/sample_large.md").unwrap_or_else(|_| {
        fs::read_to_string("/home/pranav/.local/share/Trash/files/Context Engineering.md").expect("Could not read file!")
    });
    
    println!("File size: {} bytes", input.len());
    
    println!("\nParsing Markdown -> AST...");
    let start = Instant::now();
    let document = parse_markdown(&input);
    let duration = start.elapsed();
    
    println!("--- Parsing Complete ---");
    println!("Time taken: {:?}", duration);
    println!("Frontmatter variables parsed: {}", document.frontmatter.clone().map_or(0, |f| f.as_mapping().unwrap().len()));
    println!("WikiLinks extracted: {}", document.links.len());
    println!("Tags extracted: {}", document.tags.len());
    println!("AST Top-level Nodes: {}", document.ast.len());

    let output = format!("{:#?}", document);
    fs::write("output_ast.txt", output).expect("Could not write file");
    
    println!("\nSaved AST visualization to 'output_ast.txt'");
}
