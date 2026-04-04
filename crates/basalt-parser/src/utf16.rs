use ropey::Rope;

pub struct TextDocument {
    rope: Rope,
}

impl TextDocument {
    pub fn new(text: &str) -> Self {
        Self {
            rope: Rope::from_str(text),
        }
    }

    /// Converts a CodeMirror UTF-16 offset into a Rust UTF-8 byte offset.
    pub fn utf16_to_byte_offset(&self, utf16_offset: usize) -> Option<usize> {
        // Find the character index corresponding to the UTF-16 offset
        // If the offset is out of bounds, ropey methods typically panic,
        // but we can check limits or just let it panic if we expect CodeMirror to be accurate.
        // For safety, we should ideally check bounds.
        let max_utf16 = self.rope.len_utf16_cu();
        if utf16_offset > max_utf16 {
            return None; // Out of bounds
        }

        let char_idx = self.rope.utf16_cu_to_char(utf16_offset);
        Some(self.rope.char_to_byte(char_idx))
    }

    /// Converts a Rust UTF-8 byte offset into a CodeMirror UTF-16 offset.
    pub fn byte_offset_to_utf16(&self, byte_offset: usize) -> Option<usize> {
        let max_bytes = self.rope.len_bytes();
        if byte_offset > max_bytes {
            return None; // Out of bounds
        }

        let char_idx = self.rope.byte_to_char(byte_offset);
        Some(self.rope.char_to_utf16_cu(char_idx))
    }

    // Helper to get the actual rope if needed
    pub fn as_rope(&self) -> &Rope {
        &self.rope
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
}
