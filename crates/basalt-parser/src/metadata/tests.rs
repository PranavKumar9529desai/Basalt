use super::extract_metadata;
use basalt_types::Span;

#[test]
fn test_extract_metadata() {
    let input = "---\ntitle: Test\n---\n# My Heading\nHere is a #tag and a [[Link|Alias]] formatting. ^block-1";
    let meta = extract_metadata(input);

    assert!(meta.frontmatter.is_some());
    assert_eq!(meta.tags, vec!["tag"]);
    assert_eq!(meta.links, vec!["Link"]);

    // Verify Locations
    assert_eq!(meta.headings.len(), 1);
    assert_eq!(meta.headings[0].0, 1);
    assert_eq!(meta.headings[0].1, "My Heading");

    // Ensure UTF-16 span exists
    assert!(meta.headings[0].2.end > meta.headings[0].2.start);
    assert_eq!(meta.tag_locations.len(), 1);
    assert_eq!(meta.link_locations.len(), 1);
    assert!(meta.embeds.is_empty());
}

#[test]
fn test_extract_embeds_and_links() {
    let input = "Here is a [[Link|Alias]] and an ![[image.png]] embed.\nAlso ![[docs/diagram.pdf|Diagram]] and ![[audio.mp3]].";
    let meta = extract_metadata(input);

    assert_eq!(meta.links, vec!["Link"]);
    assert_eq!(
        meta.embeds,
        vec!["image.png", "docs/diagram.pdf", "audio.mp3"]
    );

    assert_eq!(meta.link_locations.len(), 1);
    assert_eq!(meta.embed_locations.len(), 3);
    assert_eq!(meta.embed_locations[0].0, "image.png");
    assert_eq!(meta.embed_locations[1].0, "docs/diagram.pdf");
    assert_eq!(meta.embed_locations[2].0, "audio.mp3");
}

#[test]
fn test_extract_metadata_emoji_zwj_and_surrogates() {
    // "🚀" = 4 bytes UTF-8, 2 code units UTF-16
    // "👨‍👩‍👧‍👦" = 25 bytes UTF-8, 11 code units UTF-16
    let input = "Intro 🚀 rocket and family 👨‍👩‍👧‍👦 end.\n# Heading 1\nSee [[Target]] and #tag.";
    let meta = extract_metadata(input);

    assert_eq!(meta.links, vec!["Target"]);
    assert_eq!(meta.tags, vec!["tag"]);
    assert_eq!(meta.headings.len(), 1);

    // Verify heading span in UTF-16:
    // "Intro " (6) + "🚀" (2) + " rocket and family " (19) + "👨‍👩‍👧‍👦" (11) + " end.\n" (6) = 44 UTF-16 code units
    let h_span = &meta.headings[0].2;
    assert_eq!(h_span.start, 44);
    assert_eq!(h_span.end, 55);

    // Verify link span:
    // After "# Heading 1\n" (+12 -> 56):
    // "See " (+4 -> 60):
    // "[[Target]]" starts at 60, ends at 70 (len 10)
    let l_span = &meta.link_locations[0].1;
    assert_eq!(l_span.start, 60);
    assert_eq!(l_span.end, 70);

    // Verify tag span:
    // " and " (+5 -> 75):
    // "#tag" starts at 75, ends at 79 (len 4)
    let t_span = &meta.tag_locations[0].1;
    assert_eq!(t_span.start, 75);
    assert_eq!(t_span.end, 79);
}

#[test]
fn test_extract_metadata_cjk() {
    let input = "# ノートのタイトル\n本文テキスト。[[リンク先|表示名]]を参照。 #重要タグ";
    let meta = extract_metadata(input);

    assert_eq!(meta.headings.len(), 1);
    assert_eq!(meta.headings[0].1, "ノートのタイトル");
    assert_eq!(meta.links, vec!["リンク先"]);
    assert_eq!(meta.tags, vec!["重要タグ"]);

    // In UTF-16:
    // "# ノートのタイトル\n" = 1 (#) + 1 ( ) + 8 (ノートのタイトル) + 1 (\n) = 11 code units
    // "本文テキスト。" = 7 code units
    // "[[リンク先|表示名]]" starts at 11 + 7 = 18
    // Content: "[[" (2) + "リンク先" (4) + "|" (1) + "表示名" (3) + "]]" (2) = 12 code units -> ends at 30
    let l_span = &meta.link_locations[0].1;
    assert_eq!(l_span, &Span { start: 18, end: 30 });

    // "を参照。 " = 5 code units -> 35
    // "#重要タグ" starts at 35, ends at 40
    let t_span = &meta.tag_locations[0].1;
    assert_eq!(t_span, &Span { start: 35, end: 40 });
}

#[test]
fn test_deduplication_in_place() {
    let input = "---\ntags: [apple, banana]\n---\n# Notes\nHere is #banana and #cherry, with [[Note1]] and [[Note2]].\nAgain [[Note1]]!";
    let meta = extract_metadata(input);

    // Sorted and unique:
    assert_eq!(meta.tags, vec!["apple", "banana", "cherry"]);
    assert_eq!(meta.links, vec!["Note1", "Note2"]);

    // Locations preserved for all occurrences:
    assert_eq!(meta.link_locations.len(), 3);
    assert_eq!(meta.link_locations[0].0, "Note1");
    assert_eq!(meta.link_locations[1].0, "Note2");
    assert_eq!(meta.link_locations[2].0, "Note1");
}
