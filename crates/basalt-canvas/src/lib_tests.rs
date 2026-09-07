    use super::*;

    #[test]
    fn round_trips_obsidian_style_document() {
        let json = r#"{
            "nodes": [
                {"id":"idea1","type":"text","x":50,"y":50,"width":260,"height":120,
                 "text":"Hello","color":"4"},
                {"id":"idea2","type":"text","x":400,"y":50,"width":260,"height":120,
                 "text":"World","color":"1"},
                {"id":"ref1","type":"link","x":400,"y":250,"width":260,"height":80,
                 "url":"https://jsoncanvas.org"},
                {"id":"img1","type":"file","x":50,"y":400,"width":300,"height":200,
                 "file":"assets/photo.png"},
                {"id":"group1","type":"group","x":30,"y":20,"width":660,"height":340,
                 "label":"Project Brainstorm","backgroundStyle":"cover"}
            ],
            "edges": [
                {"id":"e1","fromNode":"idea1","fromSide":"right","toNode":"idea2","toSide":"left","label":"leads to"},
                {"id":"e2","fromNode":"idea2","fromSide":"bottom","toNode":"ref1","toSide":"top","color":"5"}
            ]
        }"#;

        let doc = parse(json).expect("valid canvas");
        assert_eq!(doc.nodes.len(), 5);
        assert_eq!(doc.edges.len(), 2);

        let text = match &doc.nodes[0] {
            CanvasNode::Text(t) => t,
            other => panic!("expected text node, got {other:?}"),
        };
        assert_eq!(text.base.id, "idea1");
        assert_eq!(text.base.color, Some(CanvasColor("4".into())));
        assert_eq!(text.text, "Hello");

        let group = match &doc.nodes[4] {
            CanvasNode::Group(g) => g,
            other => panic!("expected group node, got {other:?}"),
        };
        assert_eq!(group.label.as_deref(), Some("Project Brainstorm"));
        assert_eq!(group.background_style, Some(BackgroundStyle::Cover));

        let edge = &doc.edges[0];
        assert_eq!(edge.from_side, Some(Side::Right));
        assert_eq!(edge.to_side, Some(Side::Left));
        assert_eq!(edge.label.as_deref(), Some("leads to"));
        assert_eq!(edge.to_end, None); // absent in input; spec default is arrow

        // Round trip: parse -> serialize -> parse must be a fixed point.
        let out = serialize(&doc).expect("serialize");
        let doc2 = parse(&out).expect("re-parse");
        assert_eq!(doc, doc2);
    }

    #[test]
    fn parses_empty_canvas() {
        let doc = parse("{}").expect("empty canvas is valid");
        assert!(doc.nodes.is_empty());
        assert!(doc.edges.is_empty());
        let out = serialize(&doc).unwrap();
        assert_eq!(out, "{}");
    }

    #[test]
    fn rejects_duplicate_node_ids() {
        let json = r#"{
            "nodes": [
                {"id":"a","type":"text","x":0,"y":0,"width":100,"height":100,"text":"one"},
                {"id":"a","type":"text","x":0,"y":0,"width":100,"height":100,"text":"two"}
            ]
        }"#;
        let err = parse(json).unwrap_err();
        assert!(matches!(err, CanvasError::DuplicateNodeId(id) if id == "a"));
    }

    #[test]
    fn rejects_edges_to_unknown_nodes() {
        let json = r#"{
            "nodes": [{"id":"a","type":"text","x":0,"y":0,"width":100,"height":100,"text":"one"}],
            "edges": [{"id":"e1","fromNode":"a","toNode":"ghost"}]
        }"#;
        let err = parse(json).unwrap_err();
        assert!(
            matches!(err, CanvasError::UnknownNode(edge, node) if edge == "e1" && node == "ghost")
        );
    }

    #[test]
    fn parses_all_node_kinds() {
        let json = r#"{
            "nodes": [
                {"id":"t","type":"text","x":0,"y":0,"width":10,"height":10,"text":"hi"},
                {"id":"f","type":"file","x":0,"y":0,"width":10,"height":10,"file":"a.md"},
                {"id":"l","type":"link","x":0,"y":0,"width":10,"height":10,"url":"https://x.dev"},
                {"id":"g","type":"group","x":0,"y":0,"width":10,"height":10,"color":"4"}
            ]
        }"#;
        let doc = parse(json).unwrap();
        assert!(matches!(doc.nodes[0], CanvasNode::Text(_)));
        assert!(matches!(doc.nodes[1], CanvasNode::File(_)));
        assert!(matches!(doc.nodes[2], CanvasNode::Link(_)));
        assert!(matches!(doc.nodes[3], CanvasNode::Group(_)));
        let color = doc.nodes[3].base().color.as_ref().unwrap();
        assert!(color.is_preset());
    }

    #[test]
    fn parses_hex_color_from_plain_string() {
        let json = "{\"nodes\":[{\"id\":\"g\",\"type\":\"group\",\"x\":0,\"y\":0,\"width\":10,\"height\":10,\"color\":\"#FF0000\"}]}";
        let doc = parse(json).unwrap();
        let color = doc.nodes[0].base().color.as_ref().unwrap();
        assert!(color.is_hex());
    }
    #[test]
    fn color_preset_semantics() {
        let red = CanvasColor("1".into());
        assert!(red.is_preset());
        assert_eq!(red.preset(), Some(1));
        let purple = CanvasColor("6".into());
        assert_eq!(purple.preset(), Some(6));
        let bad = CanvasColor("7".into());
        assert_eq!(bad.preset(), None);
        assert!(!CanvasColor("ABC".into()).is_hex()); // short hex rejected
        assert!(CanvasColor("#A1B2C3".into()).is_hex());
    }

    #[test]
    fn rejects_bad_subpath() {
        let json = r#"{
            "nodes": [
                {"id":"f","type":"file","x":0,"y":0,"width":10,"height":10,"file":"a.md","subpath":"heading"}
            ]
        }"#;
        let err = parse(json).unwrap_err();
        assert!(matches!(err, CanvasError::BadSubpath(_)));
    }

    #[test]
    fn unknown_type_is_structural_error() {
        let json = r#"{
            "nodes": [
                {"id":"x","type":"video","x":0,"y":0,"width":10,"height":10}
            ]
        }"#;
        assert!(parse(json).is_err());
    }

    #[test]
    fn rejects_invalid_json() {
        assert!(matches!(parse("not json"), Err(CanvasError::Json(_))));
    }

    #[test]
    fn z_order_is_array_order() {
        let json = r#"{
            "nodes": [
                {"id":"bottom","type":"text","x":0,"y":0,"width":10,"height":10,"text":"b"},
                {"id":"top","type":"text","x":0,"y":0,"width":10,"height":10,"text":"t"}
            ]
        }"#;
        let doc = parse(json).unwrap();
        assert_eq!(doc.nodes[0].id(), "bottom");
        assert_eq!(doc.nodes[1].id(), "top");
    }
