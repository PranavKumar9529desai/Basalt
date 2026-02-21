# A test for UTF16 and UTF8 edge cases
Hello World! 👋

## Multi-byte characters
Japanese: こんにちは、世界
Arabic: مرحبا بالعالم
Devanagari: नमस्ते दुनिया

## Emojis with varying code units
Standard emoji: 🚀
Flags (uses 2 codepoints): 🇮🇳 🇺🇸

## Interleaved Unicode Code Blocks
```javascript
const rocket = "🚀";
const index = rocket.indexOf("🚀"); // We need to check correct CodeMirror UTF16 indices here!
```

- [ ] Task with an emoji 😅
- [[A WikiLink with an emoji 📝]]

```rust
fn test() {
    let s = "A text with 𝄞 (G clef)";
}
```
