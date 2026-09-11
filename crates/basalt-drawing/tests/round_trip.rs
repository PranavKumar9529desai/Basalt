//! Round-trip harness (ADR-047 Phase 5 gate): every real vault fixture must
//! parse → serialize → parse to a byte-identical scene, landing in the
//! Obsidian Excalidraw shell.
//!
//! Fixtures live in `<repo>/Excalidraw/` (untracked, copied from the user's
//! vault 2026-09-10). The test discovers them at runtime so new files are
//! covered automatically. Missing directory (CI checkout) → test skips, it is
//! a *harness*, not a unit-test gate.

use basalt_drawing::{parse_drawing_content, serialize_drawing_content};
use std::path::PathBuf;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../Excalidraw")
}

#[test]
fn round_trip_preserves_scene_across_all_fixtures() {
    let dir = fixtures_dir();
    if !dir.exists() {
        eprintln!("SKIP: fixtures dir not found at {}", dir.display());
        return;
    }

    let entries: Vec<_> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
        .filter_map(|e| e.ok())
        // Folders: `Fixing Bugs of Table.excalidraw/` is an *asset dir* for the
        // sibling `.excalidraw.md` file — never a drawing itself.
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.ends_with(".excalidraw.md")
                || name.ends_with(".excalidraw")
                || name.ends_with(".md")
        })
        .collect();

    assert!(
        !entries.is_empty(),
        "no drawing fixtures found in {}",
        dir.display()
    );

    for entry in &entries {
        let path = entry.path();
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        let content = std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("read {}: {e}", path.display()));

        // ── parse ───────────────────────────────────────────────────────────
        let parsed = parse_drawing_content(&content);
        if !basalt_drawing::is_drawing_content(&content) {
            // Not a drawing (classifier covers plain-notes-with-drawing-ext);
            // the command-layer rejects already gate this case.
            continue;
        }

        // ── serialize (with the original as `existing` → correct writer path) ──
        let serialized = serialize_drawing_content(&parsed.data_json, Some(&content));

        // Writer lint (ADR-047 §9 verification gate): the output must be a
        // full Obsidian shell, never a fence-less or Basalt-divergent hull.
        assert!(
            serialized.contains("# Excalidraw Data"),
            "[{name}] missing '# Excalidraw Data' hull"
        );
        assert!(
            serialized.contains("## Text Elements"),
            "[{name}] missing '## Text Elements' section"
        );
        assert!(
            serialized.contains("## Drawing"),
            "[{name}] missing '## Drawing' section"
        );
        assert!(
            serialized.contains("excalidraw-plugin: parsed"),
            "[{name}] missing excalidraw-plugin frontmatter marker"
        );
        assert!(
            serialized.contains("```json"),
            "[{name}] missing json fence — empty-file no-fence regression"
        );

        // ── re-parse ────────────────────────────────────────────────────────
        let reparsed = parse_drawing_content(&serialized);

        // Scene JSON must be byte-identical: the writer threads the raw
        // `data_json` string through the fence verbatim.
        assert_eq!(
            reparsed.data_json, parsed.data_json,
            "[{name}] scene JSON changed across round-trip"
        );

        // Text-elements mirror: preserved in-place for Obsidian-shell files,
        // regenerated from the scene for fresh-shell writes. Both must
        // resolve to the same set after re-parse.
        assert_eq!(
            reparsed.text_elements, parsed.text_elements,
            "[{name}] text-elements mirror changed across round-trip"
        );

        // The output must re-classify as a drawing (marker was written).
        assert!(
            basalt_drawing::is_drawing_content(&serialized),
            "[{name}] serialized output no longer classifies as a drawing"
        );
    }
}
