---
title: The Great Basalt Architecture
author: Pranav
tags: [architecture, rust, performance]
---

# The Vision of Basalt

Basalt is designed to be a high-performance, strictly typed note-taking engine. By isolating the brain in `basalt_core`, we ensure that the entire system is deterministic and easy to test.

## Core Principles

1. **Pure Functions**: The engine does not know about the file system. It takes `&str` and returns an AST.
2. **Universal Targets**: It compiles to both Native (Tauri) and WebAssembly (Vite/Web).
3. **Graph Native**: Links and backlinks are first-class citizens.

### Links and References

This document outlines the vision, but you can read more about the technical details in [[Architecture_Notes]] or the [[Vite_Frontend_Setup]]. 

We want to make sure things like #performance and #rust-lang are always prioritized.

### Code Example

Here is a small snippet of how the logic looks:

```rust
fn process(input: &str) -> AST {
    parse(input)
}
```

> "Speed is a feature." - Someone smart

- Item 1: Parse
- Item 2: Build Graph
- Item 3: Render

---
End of document.
