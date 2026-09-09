#!/usr/bin/env python3
"""Generate a large synthetic Obsidian test vault.

Replicates the community "Testing Vault" plugin's generation algorithm
(pedersen/obsidian-testing-vault) as a standalone, reproducible script so it
can be run without Obsidian and at any scale (the plugin caps at 10k/run).

The output is a real Obsidian vault: markdown notes with frontmatter
(tags/cssclass/aliases/status/publish/due/weight), lorem-ipsum prose, and
``[[wikilink]]`` edges. Link targets always resolve to existing files, so
search, backlinks, graph, and link-resolution all exercise real data.

Usage:
    python3 generate_vault.py [OUTPUT_DIR] [NOTE_COUNT]

    OUTPUT_DIR   where the vault is written   (default: /tmp/obsidian-vault)
    NOTE_COUNT   how many .md files to make   (default: 25000)

Graph shape (percentages of NOTE_COUNT), matching the plugin defaults:
    empty    3%   files with no content
    orphan   5%   prose, no wikilinks (no inbound/outbound edges)
    leaf    25%   prose + wikilinks, only to other leaf notes
    hub    rest   prose + wikilinks, to leaf notes

Deterministic: fixed seed → identical vault every run.
"""
from __future__ import annotations

import argparse
import os
import random
import sys
from datetime import datetime, timedelta

# --------------------------------------------------------------------------- #
# Configuration (mirrors the Testing Vault plugin defaults; override via env)  #
# --------------------------------------------------------------------------- #
def env_int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))

EMPTY_PCT = env_int("VAULT_EMPTY_PCT", 3)           # empty files
ORPHAN_PCT = env_int("VAULT_ORPHAN_PCT", 5)         # prose, no links
LEAF_PCT = env_int("VAULT_LEAF_PCT", 25)            # link only to other leaves
# remainder = hub notes that link to leaf notes

MIN_TITLE_WORDS = env_int("VAULT_MIN_TITLE_WORDS", 4)
MAX_TITLE_WORDS = env_int("VAULT_MAX_TITLE_WORDS", 10)
MIN_SENTENCES = env_int("VAULT_MIN_SENTENCES", 4)
MAX_SENTENCES = env_int("VAULT_MAX_SENTENCES", 20)
MIN_SENTENCE_WORDS = env_int("VAULT_MIN_SENTENCE_WORDS", 5)
MAX_SENTENCE_WORDS = env_int("VAULT_MAX_SENTENCE_WORDS", 20)
MIN_PARAGRAPHS = env_int("VAULT_MIN_PARAGRAPHS", 1)
MAX_PARAGRAPHS = env_int("VAULT_MAX_PARAGRAPHS", 10)
MIN_LINKS = env_int("VAULT_MIN_LINKS", 1)
MAX_LINKS = env_int("VAULT_MAX_LINKS", 10)
MIN_TAGS = env_int("VAULT_MIN_TAGS", 0)
MAX_TAGS = env_int("VAULT_MAX_TAGS", 5)
FRONTMATTER_PCT = env_int("VAULT_FRONTMATTER_PCT", 90)
ALIAS_PCT = env_int("VAULT_ALIAS_PCT", 10)
PUBLISH_PCT = env_int("VAULT_PUBLISH_PCT", 50)
SEED = int(os.environ.get("VAULT_SEED", 42))

random.seed(SEED)

# --------------------------------------------------------------------------- #
# Lorem ipsum word pool (classic text, de-duplicated by construction)          #
# --------------------------------------------------------------------------- #
LOREM_RAW = (
    "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor "
    "incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud "
    "exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute "
    "irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla "
    "pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia "
    "deserunt mollit anim id est laborum sed ut perspiciatis unde omnis iste natus error "
    "sit voluptatem accusantium doloremque laudantium totam rem aperiam eaque ipsa quae "
    "ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo "
    "nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit sed quia "
    "consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt neque porro "
    "quisquam est qui dolorem ipsum quia dolor sit amet consectetur adipisci velit sed "
    "quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam "
    "quaerat voluptatem ut enim ad minima veniam quis nostrum exercitationem ullam "
    "corporis suscipit laboriosam nisi ut aliquid ex ea commodi consequatur quis autem "
    "vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae "
    "consequatur vel illum qui dolorem eum fugiat quo voluptas nulla pariatur at vero "
    "eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium "
    "voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint "
    "occaecati cupiditate non provident similique sunt in culpa qui officia deserunt "
    "mollitia animi id est laborum et harum quidem rerum facilis est et expedita "
    "distinctio nam libero tempore cum soluta nobis est eligendi optio cumque nihil "
    "impedit quo minus id quod maxime placeat facere possimus omnis voluptas assumenda "
    "est omnis dolor repellendus tempori autem quibusdam et aut officiis debitis aut "
    "rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae "
    "non recusandae itaque earum rerum hic tenetur a sapiente delectus ut aut "
    "reiciendis voluptatibus maiores doloribus asperiores repellat"
).split()

# --------------------------------------------------------------------------- #
# Text helpers                                                                 #
# --------------------------------------------------------------------------- #
_lorem_idx = 0


def lorem_word() -> str:
    """Pull words in order so prose reads as continuous lorem text."""
    global _lorem_idx
    w = LOREM_RAW[_lorem_idx % len(LOREM_RAW)]
    _lorem_idx += 1
    return w


def lorem_sentence() -> str:
    n = random.randint(MIN_SENTENCE_WORDS, MAX_SENTENCE_WORDS)
    words = [lorem_word() for _ in range(n)]
    words[0] = words[0].capitalize()
    return " ".join(words) + "."


def lorem_paragraph() -> str:
    n = random.randint(MIN_SENTENCES, MAX_SENTENCES)
    return " ".join(lorem_sentence() for _ in range(n))


def lorem_title() -> str:
    n = random.randint(MIN_TITLE_WORDS, MAX_TITLE_WORDS)
    # Random picks (not the cycling index) so titles stay collision-free enough
    # to generate 25k+ unique filenames.
    return " ".join(random.choice(LOREM_RAW).capitalize() for _ in range(n))


def random_subset(arr, k):
    return random.sample(arr, min(k, len(arr)))


TAGS_POOL = [f"tag{i}" for i in range(200)]
STATUSES = ["Backlog", "In progress", "Done"]
CSSCLASSES = ["note", "journal", "reference", "project", "archive", "draft"]


def generate_frontmatter(title: str) -> str:
    tags = random_subset(TAGS_POOL, random.randint(MIN_TAGS, MAX_TAGS))
    cssclass = random.choice(CSSCLASSES)
    status = random.choice(STATUSES)
    weight = random.randint(1, 100)
    alias = ""
    if random.random() * 100 <= ALIAS_PCT:
        alias = " ".join(w[0] for w in title.split())
    publish = "true" if random.random() * 100 > PUBLISH_PCT else "false"
    published = random.choice([0, 1])
    due = (datetime.now() + timedelta(days=random.randint(1, 365))).strftime("%Y-%m-%d")

    lines = ["---", "tags:"]
    for t in tags:
        lines.append(f'  - "{t}"')
    lines += [
        f"cssclass: {cssclass}",
        f"aliases: {alias}",
        f"publish: {publish}",
        f"status: {status}",
        f"published: {published}",
        f"due: {due}",
        f"weight: {weight}",
        "---",
    ]
    return "\n".join(lines)


def make_note(title: str, all_titles, is_orphan: bool = False, is_empty: bool = False) -> str:
    if is_empty:
        return ""

    paragraphs = [
        lorem_paragraph()
        for _ in range(random.randint(MIN_PARAGRAPHS, MAX_PARAGRAPHS))
    ]

    if not is_orphan and all_titles:
        n_links = random.randint(MIN_LINKS, MAX_LINKS)
        for target in random_subset(all_titles, n_links):
            pidx = random.randint(0, len(paragraphs) - 1)
            paragraphs[pidx] += f" [[{target}]]"

    body = "\n\n".join(paragraphs)

    if random.random() * 100 <= FRONTMATTER_PCT:
        return generate_frontmatter(title) + "\n\n" + body
    return body


# --------------------------------------------------------------------------- #
# Generation                                                                   #
# --------------------------------------------------------------------------- #
def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir", nargs="?", default="/tmp/obsidian-vault",
                        help="where the vault is written")
    parser.add_argument("note_count", nargs="?", type=int, default=25_000,
                        help="number of .md files to generate")
    args = parser.parse_args()

    num_notes = args.note_count
    out_dir = args.output_dir
    os.makedirs(out_dir, exist_ok=True)

    print(f"Generating {num_notes} notes → {out_dir} (seed={SEED})")

    # Unique titles
    print("  Generating titles...")
    titles: set[str] = set()
    title_list: list[str] = []
    while len(title_list) < num_notes:
        t = lorem_title()
        if t not in titles:
            titles.add(t)
            title_list.append(t)

    # Category boundaries (in generation order: empty → orphan → leaf → hub)
    empty_count = num_notes * EMPTY_PCT // 100
    orphan_count = num_notes * ORPHAN_PCT // 100
    leaf_count = num_notes * LEAF_PCT // 100
    leaf_start = empty_count + orphan_count
    leaf_titles = title_list[leaf_start:leaf_start + leaf_count]

    # Write notes
    print("  Writing notes...")
    for i, title in enumerate(title_list):
        if i % 5000 == 0 and i > 0:
            print(f"    {i}/{num_notes}...")

        if i < empty_count:
            content = make_note(title, [], is_empty=True)
        elif i < empty_count + orphan_count:
            content = make_note(title, [], is_orphan=True)
        else:
            # leaf and hub both link to leaf_titles
            content = make_note(title, leaf_titles)

        safe = title.replace("/", " ").replace("\\", " ").replace(":", " ")
        with open(os.path.join(out_dir, f"{safe}.md"), "w") as f:
            f.write(content)

    total = sum(
        os.path.getsize(os.path.join(out_dir, f))
        for f in os.listdir(out_dir)
        if f.endswith(".md")
    )
    print(f"  Done. {num_notes} notes, {total / (1024 * 1024):.1f} MB")


if __name__ == "__main__":
    sys.exit(main())
