# Test Vault Fixtures

How to generate large synthetic Obsidian vaults for benchmarking Basalt at
scale. Per [AGENTS.md](../AGENTS.md) §6, every performance claim must be
measured at ≥25k notes — this folder is the reference for producing those
fixtures.

## Quick start

```bash
# 25k notes (the standard Basalt tier)
python3 docs/vault-fixtures/generate_vault.py /tmp/obsidian-vault-25k 25000

# A larger stress tier
python3 docs/vault-fixtures/generate_vault.py /tmp/obsidian-vault-50k 50000
```

Point Basalt at the output directory as the vault and run your
index/search/backlink/graph benchmarks against it.

## What the generator produces

Replicates the community **"Testing Vault" plugin**
([pedersen/obsidian-testing-vault](https://github.com/pedersen/obsidian-testing-vault))
as a standalone script — no Obsidian session required, and no 10k-per-run cap.

Real Obsidian vault structure:

- Markdown notes with **frontmatter**: `tags`, `cssclass`, `aliases`, `publish`,
  `status`, `published`, `due`, `weight`
- Lorem-ipsum prose (4–20 sentences/paragraph, 1–10 paragraphs)
- **`[[wikilink]]`** edges — targets always resolve to existing files, so
  search, backlinks, graph, and link resolution all exercise real data

Graph shape (percentages of total note count), matching plugin defaults:

| Tier   | %   | Behavior                                |
| ------ | --- | --------------------------------------- |
| empty  | 3%  | zero-byte files                         |
| orphan | 5%  | prose only, no edges                    |
| leaf   | 25% | prose + links, only to other leaf notes |
| hub    | 62% | prose + links, to leaf notes            |

Default yields ~5.5 wikilinks per linked note and ~90% frontmatter coverage.

## Determinism

Fixed seed (`VAULT_SEED`, default `42`) → identical vault every run. Use this
to make benchmark runs comparable across machines and agents.

## Configuration

All knobs are env-var overrides (same names as the plugin's settings):

| Env var                                                 | Default | Meaning                |
| ------------------------------------------------------- | ------- | ---------------------- |
| `VAULT_EMPTY_PCT`                                       | 3       | empty-file share       |
| `VAULT_ORPHAN_PCT`                                      | 5       | orphan (no-link) share |
| `VAULT_LEAF_PCT`                                        | 25      | leaf share             |
| `VAULT_MIN_TITLE_WORDS` / `VAULT_MAX_TITLE_WORDS`       | 4 / 10  | title length           |
| `VAULT_MIN_SENTENCES` / `VAULT_MAX_SENTENCES`           | 4 / 20  | sentences/paragraph    |
| `VAULT_MIN_SENTENCE_WORDS` / `VAULT_MAX_SENTENCE_WORDS` | 5 / 20  | words/sentence         |
| `VAULT_MIN_PARAGRAPHS` / `VAULT_MAX_PARAGRAPHS`         | 1 / 10  | paragraphs/note        |
| `VAULT_MIN_LINKS` / `VAULT_MAX_LINKS`                   | 1 / 10  | wikilinks/linked-note  |
| `VAULT_MIN_TAGS` / `VAULT_MAX_TAGS`                     | 0 / 5   | frontmatter tags       |
| `VAULT_FRONTMATTER_PCT`                                 | 90      | notes with frontmatter |
| `VAULT_ALIAS_PCT`                                       | 10      | notes with an alias    |
| `VAULT_PUBLISH_PCT`                                     | 50      | `publish: true` rate   |
| `VAULT_SEED`                                            | 42      | RNG seed               |

Example — denser linking, 50k notes:

```bash
VAULT_MIN_LINKS=5 VAULT_MAX_LINKS=20 \
  python3 docs/vault-fixtures/generate_vault.py /tmp/dense-50k 50000
```

## Notes for agents

- **Generation speed:** ~25k notes in a few seconds (~140 MB on disk).
- **Verify before benchmarking:** a quick sanity check that the fixture is
  well-formed — link resolution should be ~100%:

  ```bash
  cd <vault-dir> && python3 - <<'EOF'
  import glob, os, re, random
  files = glob.glob("*.md")
  names = {os.path.splitext(os.path.basename(f))[0] for f in files}
  links = {t for f in random.sample(files, 500)
           for t in re.findall(r'\[\[([^\]]+)\]\]', open(f).read())}
  print(f"link resolution: {len(links & names)}/{len(links)}")
  EOF
  ```

- **Flat vs. nested:** this generator emits a **flat** vault (every note at the
  root, no subfolders). That is the worst case for the file tree's visible-node
  count and for a flat `treeNodes.filter(...)` — keep it when testing sidebar /
  tree-at-25k behaviour. For folder-depth realism, wrap notes in subdirectories
  (not yet supported; the plugin's own generator is flat too).
- **Real-vault alternative:** Rust criterion benches in
  [`crates/basalt-vault/benches`](../../crates/basalt-vault/benches) accept a
  `BENCH_VAULT_PATH` env var to benchmark against a real vault instead of a
  synthetic one — point it at a generated fixture for end-to-end realism.
