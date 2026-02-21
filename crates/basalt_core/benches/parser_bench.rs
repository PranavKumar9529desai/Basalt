use basalt_core::parse_markdown;
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn bench_parser(c: &mut Criterion) {
    let markdown_content = r#"---
title: "Evaluating serde_yaml_ng"
date: "2023-10-27"
tags: ["rust", "performance", "benchmark"]
draft: false
author: "Pranav"
nested:
  key1: value1
  key2: value2
---

# Benchmark Document

This is a test document to measure the performance of the markdown parser, particularly focusing on the frontmatter extraction and parsing using `serde_yaml_ng`.

## Features
- **Frontmatter**: Valid YAML block at the beginning.
- **Lists**:
  - Item A
  - Item B
- **Code Blocks**:
```rust
fn main() {
    println!("Hello World");
}
```

This ensures our drop-in replacement hasn't degraded performance.
"#;

    c.bench_function("parse_markdown_with_frontmatter", |b| {
        b.iter(|| parse_markdown(black_box(markdown_content)))
    });
}

criterion_group!(benches, bench_parser);
criterion_main!(benches);
