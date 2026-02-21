use std::fs;
use std::time::Instant;
use basalt_core::{parse_markdown, TextDocument};

fn main() {
    let input = fs::read_to_string("/home/pranav/Projects/Basalt/basalt_core/examples/edge_cases_test.md").unwrap();
    let doc = TextDocument::new(&input);

    let output_filepath = "/home/pranav/Projects/Basalt/basalt_core/edge_cases_output.txt";
    let mut report = String::new();

    report.push_str("=== UTF-16 to UTF-8 Mapping Report ===\n\n");
    
    // We'll test mapping every single char boundary to see how UTF16 vs UTF8 diverts
    report.push_str("Mapping visualizer (Showing Char | UTF-8 Byte Offset | UTF-16 Code Unit Offset):\n");
    report.push_str("--------------------------------------------------------------------------\n");

    let mut utf16_offset_counter = 0;
    
    // Iterate over characters
    for (char_idx, ch) in input.chars().enumerate() {
        // Only print first 100 characters to keep it readable
        if char_idx > 100 {
            report.push_str("... (truncated for brevity)\n");
            break;
        }

        let byte_offset = doc.as_rope().char_to_byte(char_idx);
        let utf16_offset = doc.as_rope().char_to_utf16_cu(char_idx);
        
        // Print character safely (replace linebreaks for visual compactness)
        let display_char = if ch == '\n' { "\\n".to_string() } else if ch == '\r' { "\\r".to_string() } else { ch.to_string() };
        
        report.push_str(&format!("'{display_char}' | Byte: {byte_offset} | UTF-16: {utf16_offset}\n"));
    }

    report.push_str("\n=== Edge Case Verifications ===\n");
    
    // Target the rocket emoji and print its offset precisely
    if let Some(rocket_idx) = input.find("🚀") {
        let rocket_char_idx = doc.as_rope().byte_to_char(rocket_idx);
        let utf16_rocket = doc.as_rope().char_to_utf16_cu(rocket_char_idx);
        let mapped_back_byte = doc.utf16_to_byte_offset(utf16_rocket).unwrap();
        
        report.push_str(&format!("Rocket Emoji 🚀 found at Byte Offset: {}\n", rocket_idx));
        report.push_str(&format!("Mapped to CodeMirror UTF-16 Offset: {}\n", utf16_rocket));
        report.push_str(&format!("Mapped back to Rust Byte Offset: {}\n", mapped_back_byte));
        assert_eq!(mapped_back_byte, rocket_idx, "Mapping cycle failed!");
        report.push_str("✅ Mapping cycle verified successfully.\n\n");
    }

    report.push_str("=== AST Parsing ===\n");
    let start = Instant::now();
    let document = parse_markdown(&input);
    let duration = start.elapsed();
    
    report.push_str(&format!("Parsing completed in {:?}\n", duration));
    
    // Write Everything
    report.push_str("\n\n=== Full AST ===\n");
    report.push_str(&format!("{:#?}", document));
    
    fs::write(output_filepath, report).expect("Could not write file");
    println!("Report generated at {}", output_filepath);
}
