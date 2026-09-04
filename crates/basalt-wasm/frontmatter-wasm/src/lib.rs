//! Minimal WASM bridge for the YAML frontmatter engine — the synchronous
//! keystroke-path parser, so per-keystroke frontmatter parsing never blocks
//! on a round trip to the main process.
//!
//! Exposes a C-ABI surface consumed by `frontmatter-wasm.ts` via
//! vite-plugin-wasm `?init` (same path as `crates/graph-wasm`). Build with
//! `cargo build --target wasm32-unknown-unknown --release` from this crate's
//! directory (see scripts/build-frontmatter-wasm.sh).
//!
//! This is the **synchronous keystroke-path** parser: the editor calls
//! `fm_parse` synchronously inside the decoration state field, so the per-view
//! model is always fresh on the very same transaction that changed the
//! frontmatter. The async IPC parser (`parse_frontmatter` Tauri command) is
//! reserved for the indexer / cold paths (ADR-022 rule 2).

use std::cell::RefCell;

/// Input buffer written from JS via `fm_alloc` (bytes of the document text
/// as UTF-8). Held in a `thread_local!` (never a `static mut`) so the pointer
/// returned to JS stays valid for the alloc→write→parse sequence.
thread_local! {
    static INPUT: RefCell<Option<Vec<u8>>> = RefCell::new(None);
    /// Serialized JSON result of the last parse, read back via `fm_ptr` +
    /// `fm_len`. One parse result at a time is enough — reads happen on the
    /// same synchronous call stack.
    static RESULT: RefCell<Option<Vec<u8>>> = RefCell::new(None);
}

/// Allocate `capacity` bytes of wasm linear memory for the JS side to write
/// the document text into. Returns the buffer offset.
#[no_mangle]
pub extern "C" fn fm_alloc(capacity: u32) -> u32 {
    INPUT.with(|i| {
        let buf = vec![0u8; capacity as usize];
        let ptr = buf.as_ptr() as u32;
        *i.borrow_mut() = Some(buf);
        ptr
    })
}

/// Parse the document text held in the input buffer. `input_offset` is the
/// linear-memory byte offset returned by `fm_alloc`. Returns the byte length
/// of the serialized JSON model (0 = no model / serialization failure); the
/// JSON itself is at `fm_ptr()`.
#[no_mangle]
pub extern "C" fn fm_parse(input_offset: u32, input_len: u32) -> u32 {
    INPUT.with(|i| {
        let input_buf = i.borrow();
        let input = input_buf.as_ref().expect("INPUT not allocated; call fm_alloc first");

        // SAFETY: `input_offset` must equal `input.as_ptr() as u32` (the linear-memory
        // byte address of the buffer we own). We verify this and derive the slice from
        // our Vec — no raw pointer from the caller is ever dereferenced.
        assert_eq!(
            input_offset,
            input.as_ptr() as u32,
            "input_offset does not match INPUT base"
        );

        let len = (input_len as usize).min(input.len());
        let text = String::from_utf8_lossy(&input[..len]).into_owned();
        let model = basalt_parser::frontmatter::parse_frontmatter(&text);
        match serde_json::to_vec(&model) {
            Ok(bytes) => {
                let len = bytes.len() as u32;
                RESULT.with(|r| *r.borrow_mut() = Some(bytes));
                len
            }
            Err(_) => 0,
        }
    })
}

/// Offset of the serialized JSON result in wasm linear memory.
#[no_mangle]
pub extern "C" fn fm_ptr() -> u32 {
    RESULT.with(|r| r.borrow().as_ref().map(|b| b.as_ptr() as u32).unwrap_or(0))
}

/// Byte length of the serialized JSON result.
#[no_mangle]
pub extern "C" fn fm_len() -> u32 {
    RESULT.with(|r| r.borrow().as_ref().map(|b| b.len() as u32).unwrap_or(0))
}