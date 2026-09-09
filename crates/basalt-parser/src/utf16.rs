use ropey::Rope;

/// A streaming dual-cursor for translating monotonic byte offsets to CodeMirror UTF-16 code units (ADR-041).
///
/// Pure ASCII spans advance 1:1 using SIMD `is_ascii()`. Non-ASCII spans advance using `char.len_utf16()`.
/// Stack-allocated, requiring zero heap allocations and having zero drift across astral codepoints,
/// emojis with ZWJ sequences, and combining diacritics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SpanCursor {
    pub byte_idx: usize,
    pub utf16_idx: usize,
}

impl SpanCursor {
    #[inline]
    pub const fn new() -> Self {
        Self {
            byte_idx: 0,
            utf16_idx: 0,
        }
    }

    /// Advances the cursor to `target_byte`, synchronizing `utf16_idx`.
    ///
    /// # Panics
    /// In debug mode, asserts that `target_byte >= self.byte_idx` and that `target_byte` is on a UTF-8 char boundary.
    #[inline]
    pub fn advance_to(&mut self, target_byte: usize, input: &str) {
        debug_assert!(
            target_byte >= self.byte_idx,
            "SpanCursor cannot move backwards: target_byte {target_byte} < byte_idx {}",
            self.byte_idx
        );
        if target_byte == self.byte_idx {
            return;
        }
        debug_assert!(
            input.is_char_boundary(target_byte),
            "target_byte {target_byte} is not a valid UTF-8 char boundary"
        );

        let delta = target_byte - self.byte_idx;
        let slice = &input.as_bytes()[self.byte_idx..target_byte];
        if slice.is_ascii() {
            self.byte_idx = target_byte;
            self.utf16_idx += delta;
        } else {
            let s = &input[self.byte_idx..target_byte];
            for c in s.chars() {
                self.utf16_idx += c.len_utf16();
            }
            self.byte_idx = target_byte;
        }
    }
}

pub struct TextDocument {
    rope: Option<Rope>,
    is_ascii: bool,
    byte_len: usize,
}

impl TextDocument {
    pub fn new(text: &str) -> Self {
        if text.is_ascii() {
            Self {
                rope: None,
                is_ascii: true,
                byte_len: text.len(),
            }
        } else {
            Self {
                rope: Some(Rope::from_str(text)),
                is_ascii: false,
                byte_len: text.len(),
            }
        }
    }

    /// Converts a CodeMirror UTF-16 offset into a Rust UTF-8 byte offset.
    /// Returns `None` if the offset is out of bounds. Kept test-only: no
    /// production path converts in this direction today.
    #[cfg(test)]
    pub fn utf16_to_byte_offset(&self, utf16_offset: usize) -> Option<usize> {
        if self.is_ascii {
            if utf16_offset > self.byte_len {
                return None;
            }
            return Some(utf16_offset);
        }

        let rope = self.rope.as_ref().unwrap();
        let max_utf16 = rope.len_utf16_cu();
        if utf16_offset > max_utf16 {
            return None;
        }

        let char_idx = rope.utf16_cu_to_char(utf16_offset);
        Some(rope.char_to_byte(char_idx))
    }

    /// Converts a Rust UTF-8 byte offset into a CodeMirror UTF-16 offset.
    /// Returns `None` if the offset is out of bounds.
    pub fn byte_offset_to_utf16(&self, byte_offset: usize) -> Option<usize> {
        if byte_offset > self.byte_len {
            return None;
        }
        if self.is_ascii {
            return Some(byte_offset);
        }

        let rope = self.rope.as_ref().unwrap();
        let char_idx = rope.byte_to_char(byte_offset);
        Some(rope.char_to_utf16_cu(char_idx))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_emoji_offset() {
        let doc = TextDocument::new("Hello 🚀 World");
        // 'H', 'e', 'l', 'l', 'o', ' ' = 6 code units
        // '🚀' = 2 code units
        // UTF-16 offset 8 should point exactly after the emoji.
        let byte_offset = doc.utf16_to_byte_offset(8).unwrap();
        assert_eq!(byte_offset, 10); // 6 bytes for "Hello " + 4 bytes for 🚀 = 10

        // Reverse
        let utf16_offset = doc.byte_offset_to_utf16(10).unwrap();
        assert_eq!(utf16_offset, 8);
    }

    #[test]
    fn test_ascii_offset() {
        let doc = TextDocument::new("Hello World");
        let byte_offset = doc.utf16_to_byte_offset(6).unwrap();
        assert_eq!(byte_offset, 6);

        let utf16_offset = doc.byte_offset_to_utf16(6).unwrap();
        assert_eq!(utf16_offset, 6);
    }

    #[test]
    fn test_span_cursor_ascii() {
        let text = "Hello world! This is 100% pure ASCII.";
        let mut cursor = SpanCursor::new();
        cursor.advance_to(5, text);
        assert_eq!(cursor.utf16_idx, 5);
        cursor.advance_to(12, text);
        assert_eq!(cursor.utf16_idx, 12);
        cursor.advance_to(text.len(), text);
        assert_eq!(cursor.utf16_idx, text.len());
    }

    #[test]
    fn test_span_cursor_unicode() {
        // "👨‍👩‍👧‍👦" is 25 bytes in UTF-8, 11 code units in UTF-16
        // " " is 1 byte, 1 code unit
        // "日本語" is 9 bytes in UTF-8 (3 * 3), 3 code units in UTF-16
        let text = "👨‍👩‍👧‍👦 日本語";
        let mut cursor = SpanCursor::new();

        // Advance past emoji: 25 bytes -> 11 code units
        cursor.advance_to(25, text);
        assert_eq!(cursor.utf16_idx, 11);

        // Advance past space: 26 bytes -> 12 code units
        cursor.advance_to(26, text);
        assert_eq!(cursor.utf16_idx, 12);

        // Advance past Japanese: 35 bytes -> 15 code units
        cursor.advance_to(text.len(), text);
        assert_eq!(cursor.byte_idx, 35);
        assert_eq!(cursor.utf16_idx, 15);
    }
}
