# ADR-034: Embed Rendering — Real Media in Every Surface

**Status:** Accepted (2026-09-05)
**Date:** 2026-09-05
**Extends:** ADR-029 (single renderer), ADR-033 (syntax registry), ADR-020 (desktop-tier performance)

## Implemented (2026-09-05)

All five parts shipped on `feat/adr34-embed-rendering` (base branch `main`):

| Part | What shipped                                                                                                                | Key files                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A    | Loopback HTTP media server (random port, Range/206, path-traversal guard, 64 KiB streaming) + platform-aware `resolveAsset` | `apps/tauri/src-tauri/src/commands/media.rs`, `apps/tauri/src/app-shell/mediaServer.ts`, `apps/tauri/src/app-shell/useLeafServices.ts` |
| B    | Table cells render `![[…]]` as real `<img>/<video>/<audio>`; `.cm-table-link[data-name]` on links + media                   | `packages/editor/src/block-widgets/table-widget.ts`                                                                                    |
| C    | Live preview renders real media in every caret state (Obsidian parity)                                                      | `packages/editor/src/preview/embeds.ts`, `packages/editor/src/input/embed-media.ts` (`buildEmbedWidget`)                               |
| D    | Reading-mode link clicks slice `[[…]]` via syntax offsets; table links navigate                                             | `packages/editor/src/editor.ts`, `packages/editor/src/syntax/wiki-links.ts` (`targetFromWikiLinkNode`)                                 |
| E    | Extension-less stems resolve via unique case-insensitive filename match                                                     | `apps/tauri/src/app-shell/useLeafServices.ts`                                                                                          |

Deliberate deviations from the plan above — documented for future readers:

- **Server start is lazy, not at-boot:** the `media_server_url` command binds the
  listener on first invocation (memoized `OnceLock`), fired fire-and-forget in
  parallel with the `boot` invoke so TTI is untouched. Works the same; costs
  nothing until a Linux embed actually needs a URL.
- **Range is served only when requested:** WebKitGTK's first request is sometimes
  a plain GET — `plan_response` answers `200` + full body when no `Range` header
  is present, and `206`/`Content-Range` only when it is. Seeking still works
  (the pipeline's subsequent requests carry `Range`).
- **Part C keeps WYSIWYM for broken embeds only:** valid media renders under the
  caret too (per the decision below), but unresolvable targets keep the chip AND
  the caret reveal — raw `![[ghost.png]]` stays editable under the caret so a bad
  target can be fixed in place.
- **`buildEmbedWidget(url, target)`** needs no `view` (the widget binds nothing
  per-view).
- **Part E uses the vault tree, not `findNoteByName`**: that helper only matches
  exact names / `name + ".md"`, so `resolveAsset` does its own unique
  case-insensitive stem scan over `ws.treeNodes` (nullable on ambiguity).
- Tests live at `packages/editor/tests/integration/embeds.test.ts`,
  `tests/block-widgets/table-widget.test.ts`, `tests/reading-links.test.ts`, and
  `commands/media.rs` (9 unit tests: Range parsing, traversal guard, MIME map).

Verified with `bun run lint`, `bunx tsc --noEmit`, `bun run test` (editor + app),
`cargo test --workspace`, and `cargo clippy -p tauri@0.1.0 --all-targets -D warnings`.

## Context

Basalt's embed support (`![[target]]`) is measured against Obsidian. An
exhaustive fixture suite — every supported raster image, vector SVG, six video
containers, seven audio containers, PDF, a `.txt` fallback, and syntax variants
(alias, anchor, stem, wikilink-vs-embed) — lives in the test vault note
`Internet Assets Test Suite.md` (`_attachments/test/` for the media). Testing it
exposed **five distinct failures**:

1. **Video/audio never play on Linux** — all 13 video/audio rows fail in reading
   mode, even though every fixture is a valid web-playable file and the system
   has the required GStreamer decoders (`gst-libav`: `avdec_aac`, `avdec_flac`,
   `avdec_opus`, `avdec_vp8/9`) and demuxers (`qtdemux`, `matroskademux`,
   `avidemux`, `oggdemux`, `wavparse`, `flacparse`). Obsidian plays the same
   files fine.
2. **Embeds inside tables never render in any mode** — image/video/audio tables
   show raw syntax text, not media, even in reading mode.
3. **Real media only exists in reading mode** — edit/live-preview shows a
   compact chip (`📎 filename`); Obsidian renders the media inline in Live
   Preview too, regardless of caret position.
4. **Wikilink clicks break in reading mode** — `[[Rust]]` errors with
   `Could not find linked note: "[[Rust]]"` — the brackets are passed through
   as part of the link name.
5. **Extension-less stems don't resolve** — `![[asset-png]]` (Obsidian resolves
   by filename across the vault) fails; `resolveAsset` only joins the path
   verbatim.

Read-only research: codebase tracing (`packages/editor`, `apps/tauri`),
GStreamer/WebKitGTK probing on the dev machine, and web research into the Tauri
asset-protocol limitations.

## Root Causes

### 1. `asset://` cannot serve `<video>`/`<audio>` on WebKitGTK

`<img>` loads through the WebView's network stack, so Tauri's `asset://` custom
protocol works for images. `<video>`/`<audio>` media is fetched by **GStreamer**
(the webview's media pipeline), which has **no handler for the `asset://`
scheme** — it only understands `file://`, `http(s)://`, and a few media
protocols. Result: valid files, installed codecs, and still a blank/black
player. This is a decade-old WebKit bug
([bugs.webkit.org 146351](https://bugs.webkit.org/show_bug.cgi?id=146351),
open since 2015), tracked in Tauri as
[tauri#3725](https://github.com/tauri-apps/tauri/issues/3725).

Obsidian (Electron/Chromium) is immune because Chromium's media stack handles
`file://` and custom protocols natively, which is also why it plays far more
codecs than WebKitGTK. Note: on macOS (WKWebView) and Windows (WebView2/Chromium)
`asset://` **does** serve media — this is specifically the Linux WebKitGTK gap.

Upstream mitigations:

| Approach                                        | Status                                    | Notes                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GStreamer plugin handling `asset://`            | tauri PR #14402 (open), bundler PR #15965 | Not merged/released; needs `.so` in GStreamer search path + `WEBKIT_GST_ALLOWED_URI_PROTOCOLS="asset"` env            |
| Bundle Media Framework (`bundleMediaFramework`) | Exists in Tauri 2 bundler                 | Bundles GStreamer _plugins_ into AppImage, does **not** teach GStreamer the `asset://` scheme — does not fix this bug |
| Serve files over localhost HTTP                 | Docs-recommended workaround               | GStreamer/WebKit plays `http://127.0.0.1:port/…` with correct Range/206 — this is the reliable fix                    |

### 2. Table embeds never render because the table block widget owns the whole range

The live-preview walk treats a `Table` node atomically: `handleTableNode`
(`packages/editor/src/preview/live-preview.ts:272`) returns `true` and the walk
skips descent, so cell children (including `WikiLink`/`EmbedMark` nodes) are
never visited by the walk. When the cursor is outside the table, the registered
table block widget replaces the entire `Table` span with `TableBlockWidget`
(`block-widgets/table-widget.ts`) whose string-based `renderInlineCell`
(`table-widget.ts:83`) handles only `[[…]]` (rendered as a `.cm-table-link`
span), `**bold**`, `*italic*`, and `` `code` `` — **no `![[…]]` branch**.

The reading-mode `embedMediaPlugin` (`input/embed-media.ts`, `Decoration.replace`
of the embed span) cannot recover: the table widget's replace-range is larger
and earlier, so the nested embed decoration is swallowed. Hence raw text even in
reading mode.

Separately, `.cm-table-link` spans have **no click handler** — links inside
rendered tables aren't navigable.

### 3. Edit-mode embeds are chips by design, media is reading-only

`handleEmbedNode` (`preview/embeds.ts:106`) emits an `EmbedChipWidget` when the
caret is **off** the embed's line and returns early in reading mode, deferring
real media to `embedMediaPlugin` (wired only into `readingExtensions()` /
`readingModeExtras()` in `editor.ts:251,277`). So live preview = chip, reading =
media. Obsidian renders the media inline in Live Preview in all caret states.

### 4. `readingLinkHandler` reads `textContent`, which still contains `[[ ]]`

`readingLinkHandler` (`editor.ts:290`) intercepts clicks on `.cm-live-wikilink`
and uses `wikiSpan.textContent?.trim()`. Mark-hiding (`preview/mark-hiding.ts`)
hides the bracket marks with `display: none`, but CSS hiding does **not** remove
them from `textContent` — so the link name arrives as `"[[Rust]]"`. The edit-mode
path (`syntax/wiki-links.ts` `clickableLinksPlugin`) correctly slices
`node.from + 2 .. node.to - 2`, which is why edit-mode navigation works.

### 5. `resolveAsset` is a naive path join

`resolveAsset` (`apps/tauri/src/app-shell/useLeafServices.ts:55`) returns
`convertFileSrc(vaultPath + "/" + target)` with no file-system lookup, so
extension-less stems and case-insensitive matches (both supported by Obsidian)
fail.

## Decision

Adopt a five-part fix:

### A. Linux media via a localhost HTTP server (Range-capable)

**Add a streaming HTTP server in the Rust backend that serves vault files over
`http://127.0.0.1:<random-port>/` with correct MIME types and HTTP Range/206
support.** `resolveAsset` returns those URLs for Linux; `convertFileSrc`
(`asset://`) stays for macOS/Windows where it works.

- Bind to `127.0.0.1` only, on a random free port, started at app boot.
- Media-only endpoint (serve any file the app may embed: images, audio, video,
  PDF). `Content-Type` from the extension using the same classification table
  as `classifyMediaExtension` (`embed-utils.ts:61`).
- **Range requests are mandatory** (206 partial content): WebKitGTK's media
  pipeline seeks by issuing byte-range requests; files that respond 200 without
  a `Content-Range` header seek to zero and stall.
- Rust side is dependency-light: either `tauri`'s registered URI scheme handler
  (`register_asynchronous_uri_scheme_protocol`) on an `http`-reachable host, or a
  tiny tokio thread serving with `http-range` parsing (see Tauri's
  `examples/streaming/main.rs`). Prefer a real TCP listener (not a custom
  `media://` scheme) because GStreamer only reliably plays well-known schemes.
- The webview already allows non-`asset` origins (CSP is `null`,
  `tauri.conf.json`; `VITE` dev URL is `http://localhost:1420`), so `http`
  media URLs load without CSP changes. Confirm + tighten CSP to
  `media-src http://127.0.0.1:*` when CSP is later hardened.

`resolveAsset` becomes platform-aware:

```ts
// apps/tauri/src/app-shell/useLeafServices.ts
resolveAsset: ws.vaultPath
  ? (target) => {
      const absPath = target.startsWith("/") ? target : `${ws.vaultPath}/${target}`;
      if (mediaKind(target) === "other") return null;       // no broken <img>
      if (isLinux()) return mediaUrlFor(absPath);            // http://127.0.0.1:PORT/media?path=…
      return convertFileSrc(absPath);                         // asset:// (mac/win)
    }
  : undefined,
```

Linux detection via `@tauri-apps/plugin-os` (or `navigator.userAgent`); the
server URL is exposed through a boot IPC command (`media_server_url` below).

### B. Table cells render embeds; table links become clickable

`TableBlockWidget.toDOM(view)` already receives the view — thread
`resolveAssetFacet` into the cell renderer instead of the standalone string
function:

- `renderInlineCell(view, text)` gains an embed branch: match `![[target]]`
  (reuse `embedTargetFromWikiLink` logic via a local parse since the cell
  renderer works on raw strings), map through `classifyMediaExtension`, and emit
  `<img>`, `<video controls>`, `<audio controls>`, or a PDF `<iframe>` using the
  resolved URL. Non-resolvable targets render the fallback chip (`⚠ target`).
- `.cm-table-link` spans gain a `data-name` (the note target, not the display
  alias) so links inside tables become navigable via a single delegated handler
  (part D).
- Caret-on-table-line still reveals raw source (existing `active` contract in
  `table-widget.ts:194`); curs guide: keep that behavior in live preview.

### C. Real media in live preview (walk-level), not reading-only

Render real media from the live-preview walk — media in every surface:

- In `handleEmbedNode` (`preview/embeds.ts`), emit an `EmbedMediaWidget`
  (imported from `input/embed-media.ts`) instead of only the chip. The chip
  stays as the fallback for `other`/unresolvable targets (`.txt` case).
- **Caret behavior:** per decision, media stays rendered even with the caret on
  the embed's line (Obsidian parity). Editing the raw `![[…]]` syntax happens in
  source mode; live preview is read-mostly for embeds. (This drops the
  WYSIWYM reveal for embeds specifically.)
- Reading mode continues to use `embedMediaPlugin` (already real media) — or,
  after C lands, both paths converge on the same widget so "one walk, one media
  renderer" holds (ADR-029 spirit). Keep the plugin path for reading mode; it is
  the safer battle-tested implementation and avoids a double-decorator conflict.

### D. Reading-mode link clicks slice brackets

Rework `readingLinkHandler` (`editor.ts:290`) to resolve the link target from
**syntax offsets, not `textContent`** — mirroring `clickableLinksPlugin`
(`syntax/wiki-links.ts:115`):

- On click, compute `posAtCoords({x,y})`, `syntaxTree(state).resolveInner(pos)`,
  walk out to a `WikiLink` node, and slice `doc.sliceString(from + 2, to - 2)`
  (stripping `[[` `]]` and honoring `|alias`/`#anchor` via `.split("|")[0]
.split("#")[0]`).
- Bind the same handler to `.cm-table-link` spans (using `data-name` from B) so
  table-internal links navigate.
- Handle editor-alias `[[Note|Display]]` → navigate to `Note`.

### E. Stem resolution in `resolveAsset`

When the direct path does not resolve, fall back to a unique filename match
against the vault tree (case-insensitive, extension-less stems):

- `resolveAsset` first checks `convertFileSrc`/media URL for `vaultPath/target`;
  on miss, call `findNote`-style search (`AppProvider.findNoteByName`) for a file
  whose stem equals `target` (last path element minus extension). If exactly one
  match, use it; if zero or ambiguous, return the fallback chip rather than a
  broken embed.
- Note-target case (embedding a `.md`): out of scope for this ADR (already a
  chip/fallback path); document as future work.

## Consequences

### Benefits

- **Parity target reached for media:** all image/audio/video/PDF fixtures render
  in both live and reading mode; tables render media; links navigate.
- **Root-cause fixed, not band-aided:** `asset://`-vs-GStreamer is a platform
  bug; localhost HTTP is the documented, durable workaround.
- One widget family (`EmbedMediaWidget`) becomes the single media renderer.

### Costs / risks

- **New Rust surface:** a TCP listener + media serving command equals a new
  Tauri concern (AGENTS.md "ask first" list) — new files under
  `src-tauri/src/commands/` + `lib.rs` registration.
- **Security:** the server must restrict to vault paths (never arbitrary disk
  reads), bind loopback-only, and use a random port. Documented in the file
  plan; a path-traversal guard (`target` must stay under `vaultPath`) is
  mandatory.
- **Perf:** vhost the server over the vault cache (`cache` maps path→Content
  editable) and avoid filesystem re-reads on RMS of hot embeds. Media reads are
  once-per-file by the webview's streaming cache.
- **WebKitGTK still cannot play HEVC/H.265 or AV1** (codec licensing, not this
  bug). Obsidian's Chromium plays more codecs. Document per-format limits in the
  test note rather than chasing every container; AVI/MKV remain best-effort (the
  demuxers exist here, but container quirks will vary by system GStreamer).

### Non-goals

- **GStreamer `asset://` plugin bundling** is deferred to upstream (PR #14402 /
  #15965). Revisit when Tauri ships it; can be swapped in without touching the
  frontend because `resolveAsset` already abstracts URL production.
- **Bundling ffmpeg sidecars / transcoding** for unsupported codecs is out of
  scope (different workstream).
- `.md`-content embedding and DQL block media remain future work.

## Implementation plan (file-level)

1. `apps/tauri/src-tauri/src/commands/media.rs` (new) + `src-tauri/src/lib.rs`:
   `media_server_url` command → start loopback TCP listener, return
   `http://127.0.0.1:{port}`; `register` in `commands/mod.rs`. Tokio or
   `std::net` thread + `http-range` crate for Range/206 and
   `Content-Type`/`Content-Length`. Path-traversal guard against `vaultPath`.
2. `apps/tauri/src/app-shell/useLeafServices.ts`: platform-aware `resolveAsset`
   (http URL on Linux, `convertFileSrc` elsewhere) + stem fallback; `mediaKind`
   guard to route `other` (`asset-txt.txt`) to the fallback chip.
3. `apps/tauri/src/app-shell/Shell.tsx`: pass `resolveAsset` (already wired via
   `leafServices`); no change needed beyond A/E — verify `previewDeps.resolveAsset`
   picks up the new resolver.
4. `packages/editor/src/preview/embeds.ts`: `handleEmbedNode` emits
   `EmbedMediaWidget` (media always, no caret gating for valid targets); chip
   only for `other`/unresolvable. Honor `resolveAssetFacet` returning `null`.
5. `packages/editor/src/input/embed-media.ts`: export a `buildEmbedWidget(target,
url, view)` factory usable by the walk and the plugin (DRY); keep plugin.
6. `packages/editor/src/block-widgets/table-widget.ts`: `renderInlineCell`
   becomes `renderInlineCell(view, text)` with a `![[…]]` media branch
   (`resolveAssetFacet` read from `view.state`); `.cm-table-link` gets
   `data-name`.
7. `packages/editor/src/editor.ts`: `readingLinkHandler` slices via
   `posAtCoords` + syntax tree; binds `.cm-table-link[data-name]`.
8. `packages/editor/src/syntax/wiki-links.ts`: optionally export the
   `targetFromWikiLinkNode(state, node)` helper for reuse by D.
9. `package.json` / `Cargo.toml`: add `http-range` (or `http-range-header`); no
   new TS deps expected (URL construction is trivial).
10. `docs/CURRENT_WORK.md` + this ADR's index row in `../../AGENTS.md`.

### Tests

- `packages/editor/tests/preview/embeds.test.*`: media widget emitted in live
  walk; chip for `other`; caret-on-line still renders media.
- `packages/editor/tests/preview/table-widget.test.*`: embed in cell → media
  HTML; `.cm-table-link` has `data-name`.
- `packages/editor/tests/link-click.test.*`: `[[Rust]]` returns `"Rust"`;
  `[[Rust|Disp]]` → `"Rust"`; `.cm-table-link` navigation.
- Rust: media server unit tests (Range parse, path traversal block, MIME map).

### Verification checklist (mirrors the fixture note)

- Images: PNG/JPG/GIF/WebP/BMP/ICO/SVG inline in reading **and** live preview.
- Tables: image/video/audio cells render media in both modes; wikilinks in
  cells navigate.
- Video/audio rows play on Linux (H.264 MP4/MOV/M4V, WebM/VP9, MP3/WAV/FLAC/OGG/
  AAC/Opus).
- PDF embeds via iframe; `.txt` shows fallback chip (never broken `<img>`).
- `[[Rust]]` navigates; alias + anchor variants resolve.
- Stem `![[asset-png]]` resolves via filename lookup (case-insensitive).
- `bun run lint`, `bunx tsc --noEmit`, `bun run test`, `cargo test --workspace`.
