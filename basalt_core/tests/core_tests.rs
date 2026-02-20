use basalt_core::{parse_markdown, MarkdownNode, NoteGraph};

#[test]
fn test_frontmatter_parsing() {
    let input = "---\ntitle: Hello World\nauthor: Pranav\n---\n# Heading\nContent";
    let doc = parse_markdown(input);
    
    let frontmatter = doc.frontmatter.expect("Should have frontmatter");
    assert_eq!(frontmatter.get("title").unwrap().as_str().unwrap(), "Hello World");
    assert_eq!(frontmatter.get("author").unwrap().as_str().unwrap(), "Pranav");
    
    // Check AST starts with Heading
    match &doc.ast[0] {
        MarkdownNode::Heading(1, children) => {
            if let MarkdownNode::Text(text) = &children[0] {
                assert_eq!(text, "Heading");
            } else {
                panic!("Expected Text node");
            }
        },
        _ => panic!("Expected Heading 1"),
    }
}

#[test]
fn test_wikilinks_and_tags() {
    let input = "This is a [[WikiLink]] and a #tag inside a paragraph.";
    let doc = parse_markdown(input);
    
    assert!(doc.links.contains(&"WikiLink".to_string()));
    assert!(doc.tags.contains(&"tag".to_string()));
}

#[test]
fn test_note_graph() {
    let mut graph = NoteGraph::new();
    
    let doc1 = parse_markdown("Link to [[Note2]] and [[Note3]]");
    let doc2 = parse_markdown("Link to [[Note1]] and #some-tag");
    
    graph.add_document("Note1", &doc1);
    graph.add_document("Note2", &doc2);
    
    let n1_forward = graph.get_forward_links("Note1").unwrap();
    assert!(n1_forward.contains("Note2"));
    assert!(n1_forward.contains("Note3"));
    
    let n1_back = graph.get_back_links("Note1").unwrap();
    assert!(n1_back.contains("Note2")); // From Note2's link to Note1
    
    let n2_forward = graph.get_forward_links("Note2").unwrap();
    assert!(n2_forward.contains("Note1"));
    
    let n2_back = graph.get_back_links("Note2").unwrap();
    assert!(n2_back.contains("Note1")); // From Note1's link to Note2
}

#[test]
fn test_remove_document() {
    let mut graph = NoteGraph::new();
    
    let doc1 = parse_markdown("Link to [[Note2]]");
    let doc2 = parse_markdown("Hello");
    
    graph.add_document("Note1", &doc1);
    graph.add_document("Note2", &doc2);
    
    assert!(graph.get_back_links("Note2").unwrap().contains("Note1"));
    
    // Now remove Note1
    graph.remove_document("Note1");
    
    assert!(graph.get_forward_links("Note1").is_none());
    assert!(!graph.get_back_links("Note2").unwrap().contains("Note1"));
}
