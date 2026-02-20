use std::fs;
use basalt_core::parse_markdown;

fn main() {
    let input = fs::read_to_string("/home/pranav/Documents/obsidian/Context Engineering.md").expect("Could not read file");
    
    let document = parse_markdown(&input);

    let output = format!("{:#?}", document);
    fs::write("output_ast.txt", output).expect("Could not write file");
    
    println!("Successfully parsed 'sample_large.md' and saved the output to 'output_ast.txt'!");
}
