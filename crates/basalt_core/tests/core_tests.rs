use basalt_core::{extract_metadata, parse_markdown, MarkdownNode, NoteGraph, StringArena};

#[test]
fn test_frontmatter_parsing() {
    let input = "---\ntitle: Hello World\nauthor: Pranav\n---\n# Heading\nContent";
    let doc = parse_markdown(input);

    let frontmatter = doc.frontmatter.expect("Should have frontmatter");
    assert_eq!(
        frontmatter.get("title").unwrap().as_str().unwrap(),
        "Hello World"
    );
    assert_eq!(
        frontmatter.get("author").unwrap().as_str().unwrap(),
        "Pranav"
    );

    // Check AST starts with Heading
    match &doc.ast[0] {
        MarkdownNode::Heading(1, children) => {
            if let MarkdownNode::Text(text) = &children[0] {
                assert_eq!(text, "Heading");
            } else {
                panic!("Expected Text node");
            }
        }
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
    let mut arena = StringArena::new();
    let mut graph = NoteGraph::new();

    let doc1 = extract_metadata("Link to [[Note2]] and [[Note3]]");
    let doc2 = extract_metadata("Link to [[Note1]] and #some-tag");

    graph.add_document("Note1", doc1, &mut arena);
    graph.add_document("Note2", doc2, &mut arena);

    let note1_id = arena.get_id("Note1").unwrap();
    let note2_id = arena.get_id("Note2").unwrap();
    let note3_id = arena.get_id("Note3").unwrap();

    let n1_forward = graph.get_forward_links(note1_id).unwrap();
    assert!(n1_forward.contains(&note2_id));
    assert!(n1_forward.contains(&note3_id));

    let n1_back = graph.get_back_links(note1_id).unwrap();
    assert!(n1_back.contains(&note2_id)); // From Note2's link to Note1

    let n2_forward = graph.get_forward_links(note2_id).unwrap();
    assert!(n2_forward.contains(&note1_id));

    let n2_back = graph.get_back_links(note2_id).unwrap();
    assert!(n2_back.contains(&note1_id)); // From Note1's link to Note2
}

#[test]
fn test_remove_document() {
    let mut arena = StringArena::new();
    let mut graph = NoteGraph::new();

    let doc1 = extract_metadata("Link to [[Note2]]");
    let doc2 = extract_metadata("Hello");

    graph.add_document("Note1", doc1, &mut arena);
    graph.add_document("Note2", doc2, &mut arena);

    let note1_id = arena.get_id("Note1").unwrap();
    let note2_id = arena.get_id("Note2").unwrap();

    assert!(graph.get_back_links(note2_id).unwrap().contains(&note1_id));

    // Now remove Note1
    graph.remove_document("Note1", &mut arena);

    assert!(graph.get_forward_links(note1_id).is_none());
    assert!(!graph.get_back_links(note2_id).unwrap().contains(&note1_id));
}
