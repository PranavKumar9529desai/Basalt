use basalt_types::{TaskData, TaskPriority, TaskStatus};
use chrono::NaiveDate;

use crate::metadata::extract_metadata;

fn date(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).expect("valid test date")
}

fn task(input: &str, idx: usize) -> TaskData {
    extract_metadata(input).tasks[idx].clone()
}

fn task_count(input: &str) -> usize {
    extract_metadata(input).tasks.len()
}

#[test]
fn plain_todo() {
    let t = task("- [ ] Buy groceries", 0);
    assert_eq!(t.status, TaskStatus::Todo);
    assert_eq!(t.description, "Buy groceries");
    assert_eq!(t.priority, TaskPriority::None);
    assert_eq!((t.span_start, t.span_end), (0, 19));
    assert_eq!(t.line, 1);
}

#[test]
fn every_signifier_from_the_adr_line() {
    // The full ADR-048 §2.1 example.
    let input = "- [x] Buy groceries 🔺 🔁 every week on Monday 🛫 2024-01-01 📅 2024-01-07 ⏳ 2024-01-05 ➕ 2024-01-01";
    let t = task(input, 0);
    assert_eq!(t.status, TaskStatus::Done);
    assert_eq!(t.description, "Buy groceries");
    assert_eq!(t.priority, TaskPriority::Highest);
    assert_eq!(t.recurrence.as_deref(), Some("every week on Monday"));
    assert!(!t.recurrence_when_done);
    assert_eq!(t.start, Some(date(2024, 1, 1)));
    assert_eq!(t.due, Some(date(2024, 1, 7)));
    assert_eq!(t.scheduled, Some(date(2024, 1, 5)));
    assert_eq!(t.created, Some(date(2024, 1, 1)));
    assert!(t.done.is_none() && t.cancelled.is_none());
}

#[test]
fn every_status_symbol() {
    assert_eq!(task("- [ ] a", 0).status, TaskStatus::Todo);
    assert_eq!(task("- [/] a", 0).status, TaskStatus::InProgress);
    assert_eq!(task("- [?] a", 0).status, TaskStatus::OnHold);
    assert_eq!(task("- [x] a", 0).status, TaskStatus::Done);
    assert_eq!(task("- [X] a", 0).status, TaskStatus::Done);
    assert_eq!(task("- [-] a", 0).status, TaskStatus::Cancelled);
    // Unknown symbol → Todo (ADR-048 §2.2).
    assert_eq!(task("- [z] a", 0).status, TaskStatus::Todo);
}

#[test]
fn every_priority_emoji() {
    assert_eq!(task("- [ ] a 🔺", 0).priority, TaskPriority::Highest);
    assert_eq!(task("- [ ] a ⏫", 0).priority, TaskPriority::High);
    assert_eq!(task("- [ ] a 🔼", 0).priority, TaskPriority::Medium);
    assert_eq!(task("- [ ] a 🔽", 0).priority, TaskPriority::Low);
    assert_eq!(task("- [ ] a ⏬", 0).priority, TaskPriority::Lowest);
}

#[test]
fn first_priority_emoji_wins() {
    assert_eq!(task("- [ ] a 🔽 🔺", 0).priority, TaskPriority::Low);
}

#[test]
fn done_and_cancelled_dates() {
    let t = task("- [x] a ✅ 2024-01-07", 0);
    assert_eq!(t.done, Some(date(2024, 1, 7)));
    let t = task("- [-] a ❌ 2024-01-06", 0);
    assert_eq!(t.cancelled, Some(date(2024, 1, 6)));
}

#[test]
fn recurrence_when_done_flag() {
    let t = task("- [ ] Water plants 🔁 every 3 days when done", 0);
    assert_eq!(t.recurrence.as_deref(), Some("every 3 days"));
    assert!(t.recurrence_when_done);
}

#[test]
fn recurrence_stops_at_next_signifier() {
    let input = "- [ ] a 🔁 every week 🛫 2024-01-01";
    let t = task(input, 0);
    assert_eq!(t.recurrence.as_deref(), Some("every week"));
    assert_eq!(t.start, Some(date(2024, 1, 1)));
}

#[test]
fn id_depends_on_and_on_completion() {
    let t = task(
        "- [ ] Deploy 🆔 deploy-1 ⛔ build-3 ⛔ review-2 🏁 delete",
        0,
    );
    assert_eq!(t.id.as_deref(), Some("deploy-1"));
    assert_eq!(t.depends_on, vec!["build-3", "review-2"]);
    assert_eq!(t.on_completion.as_deref(), Some("delete"));
}

#[test]
fn inline_tags_stripped_from_description() {
    let t = task("- [ ] Buy #groceries #urgent stuff", 0);
    assert_eq!(t.tags, vec!["groceries", "urgent"]);
    assert_eq!(t.description, "Buy stuff");
}

#[test]
fn nested_tags_use_slash_separator() {
    assert_eq!(
        task("- [ ] Work #project/alpha", 0).tags,
        vec!["project/alpha"]
    );
}

#[test]
fn task_tags_feed_the_file_level_tag_index() {
    let meta = extract_metadata("#work\n- [ ] Task #work #urgent");
    assert_eq!(meta.tags, vec!["urgent", "work"]);
}

#[test]
fn indented_and_blockquote_tasks_parse() {
    assert_eq!(task("  - [ ] Indented", 0).description, "Indented");
    assert_eq!(task("> - [ ] Quote", 0).description, "Quote");
    assert_eq!(task(">> - [x] Nested", 0).status, TaskStatus::Done);
    assert_eq!(task("  1. [ ] Numbered", 0).description, "Numbered");
    assert_eq!(task("10. [ ] Double digit", 0).description, "Double digit");
}

#[test]
fn non_task_lines_are_ignored() {
    let input =
        "- plain item\nfoo - [ ] inline dash\n[x] bare checkbox\n* emphasis\n1. plain numbered";
    assert_eq!(task_count(input), 0);
}

#[test]
fn multiple_tasks_keep_document_order_and_line_numbers() {
    let input = "Intro\n- [ ] first\n- [x] second\n  - [/] third";
    let meta = extract_metadata(input);
    assert_eq!(meta.tasks.len(), 3);
    assert_eq!(meta.tasks[0].line, 2);
    assert_eq!(meta.tasks[1].line, 3);
    assert_eq!(meta.tasks[2].line, 4);
    assert_eq!(meta.tasks[2].status, TaskStatus::InProgress);
}

#[test]
fn frontmatter_counts_toward_line_numbers() {
    let input = "---\ntitle: x\n---\n- [ ] Task";
    assert_eq!(task(input, 0).line, 4);
}

#[test]
fn crlf_line_endings_are_trimmed() {
    let meta = extract_metadata("- [ ] Task\r\nOther");
    assert_eq!(meta.tasks.len(), 1);
    assert_eq!(meta.tasks[0].description, "Task");
}

#[test]
fn empty_description_task_is_valid() {
    assert_eq!(task("- [x]", 0).description, "");
    assert_eq!(task("- [ ]", 0).status, TaskStatus::Todo);
}

#[test]
fn invalid_iso_date_is_not_consumed() {
    let t = task("- [ ] Task 📅 2024-13-99", 0);
    assert!(t.due.is_none());
    assert_eq!(t.description, "Task 2024-13-99");
}

#[test]
fn non_signifier_emoji_stays_in_description() {
    let t = task("- [ ] 🚀 launch plan 🔺 top", 0);
    assert_eq!(t.priority, TaskPriority::Highest);
    assert_eq!(t.description, "🚀 launch plan top");
}

#[test]
fn emoji_inside_a_word_is_not_a_signifier() {
    let t = task("- [ ] cost🔺five", 0);
    assert_eq!(t.priority, TaskPriority::None);
    assert_eq!(t.description, "cost🔺five");
}

#[test]
fn text_after_the_last_signifier_is_preserved() {
    let t = task("- [ ] Step 1 🔺 then do the thing", 0);
    assert_eq!(t.description, "Step 1 then do the thing");
}

#[test]
fn inner_wikilinks_stay_in_the_description() {
    let meta = extract_metadata("- [ ] See [[Note]]");
    assert_eq!(meta.tasks.len(), 1);
    assert_eq!(meta.tasks[0].description, "See [[Note]]");
    assert!(meta.links.is_empty());
}

#[test]
fn ascii_line_spans_are_byte_offsets() {
    let meta = extract_metadata("# H\n- [ ] Task");
    let t = &meta.tasks[0];
    assert_eq!((t.span_start, t.span_end), (4, 14));
}

#[test]
fn unicode_line_spans_are_utf16_code_units() {
    // "Intro 🚀\n" = 8 UTF-16 units (🚀 is a surrogate pair); the task
    // line starts there and runs to EOF.
    let meta = extract_metadata("Intro 🚀\n- [ ] Task");
    assert_eq!(meta.tasks.len(), 1);
    assert_eq!((meta.tasks[0].span_start, meta.tasks[0].span_end), (9, 19));
}

#[test]
fn emoji_signifiers_in_unicode_files_set_utf16_spans() {
    let meta = extract_metadata("- [ ] Launch 🚀 📅 2024-01-07");
    let t = &meta.tasks[0];
    assert_eq!(t.due, Some(date(2024, 1, 7)));
    assert_eq!(t.description, "Launch 🚀");
    // 29 code units: "- [ ] Launch " (12) + 🚀 (2) + " 📅" (3) + " 2024-01-07" (12)
    assert_eq!((t.span_start, t.span_end), (0, 29));
}
