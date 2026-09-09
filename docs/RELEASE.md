# Basalt — Release & CI Process (READ BEFORE RELEASING OR EDITING WORKFLOWS)

> Why this file exists: the release pipeline decisions below are load-bearing and
> easy for an agent to "simplify" into something that burns GitHub Actions free
> tier or breaks an OS build. An agent doing release/CI work MUST read this file
> first. Agents experimenting with builds locally should read the **Cost model**
> section to understand why the workflow triggers look the way they do.

---

## 1. Workflow map (the only two workflows)

| File | Triggers | Jobs | Purpose |
|---|---|---|---|
| `.github/workflows/ci.yml` | push to `main`, every PR | `frontend` (oxlint → `tsc --noEmit` → vite build → vitest), `rust` (clippy `-D warnings` → `cargo test --workspace`), `build` (`ubuntu-22.04` + `windows-latest` Tauri bundles) | Quality gate + per-push package check **without macOS** |
| `.github/workflows/release.yml` | **tags `v*`** + `workflow_dispatch` (manual) | `build-and-release` matrix: `ubuntu-22.04`, `windows-latest`, **`macos-latest` (aarch64)** | Create draft GitHub Release with all 3 OS bundles |

**Hard rule: macOS builds only ever happen on tags or manual dispatch.** Never
add `macos` to `ci.yml`'s matrix or any per-push trigger. See Cost model.

### Dependency between jobs

- `ci.yml`'s `build` job has `needs: [frontend, rust]` — a failing lint/type/
  test/clippy check cancels BOTH packaging jobs before they start. This is
  deliberate: Windows minutes (×2 multiplier) must never be spent on code that
  fails a free Linux check. A new quality check added to `ci.yml` automatically
  gates the `build` job only if `build` `needs:` it — keep that list in sync.
- `release.yml` intentionally does NOT run lint/type/test/clippy itself — the
  code being tagged already passed them on `main` before the tag was cut.
  In practice tags are cut from green `main`.

---

## 2. Cost model (why the triggers are shaped this way)

GitHub Free (private repo) — current official limits:

- **2,000 Actions minutes/month**, billed per-OS: **Windows ×2**, **macOS ×10**
- Artifacts: 500 MB (auto-delete after 90 days); cache: 10 GB/repo
- Concurrency: 20 jobs total, max 5 concurrent macOS jobs; job runtime cap 6 h
- **Public repos: unlimited minutes**

Effective monthly budgets (≈5–15 min per full Tauri build, less with caching):

| OS | Effective budget | ≈ builds/month |
|---|---|---|
| Linux | 2,000 min | 130–300+ |
| Windows | 1,000 min (÷2) | 65–150 |
| macOS | 200 min (÷10) | **~15–30 — scarce, treat as precious** |

Consequences:
- macOS job runs ~1 build per 1–2 days max if used daily; budget for
  ~2–4 tag releases/month comfortably.
- Under no circumstances add macOS to PR/push workflows.
- `ubuntu-22.04` (not `latest`) matches `release.yml` — keep the two files'
  Linux image consistent so per-push builds predict release builds.

---

## 3. Release checklist (follow exactly)

1. **Bump version in ALL THREE places** — must stay in sync (currently `0.1.0`):
   - `apps/tauri/src-tauri/tauri.conf.json` → `"version"`
   - `apps/tauri/src-tauri/Cargo.toml` → `version`
   - `apps/tauri/package.json` → `"version"`
2. **Regenerate WASM if Rust compute crates changed** (graph/parser crates):
   `bun run build:wasm`, then **commit the regenerated `.wasm` files** — they are
   checked in and embedded at build time; a release built from stale wasm is a
   silent regression. (`graph_sim-*.wasm`, `frontmatter-*.wasm` in
   `apps/tauri/src`.)
3. Ensure `main` is pushed and CI `build` job (Linux+Windows) is green on the
   tip commit.
4. Cut the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. `release.yml` builds all 3 OS, uploads bundles to a **draft** release
   (`releaseDraft: true`). Review and publish the draft.
6. If anything fails on one OS, fix → commit → push → **re-tag at the new
   commit** (tags point at a commit; the release workflow runs per tag push).

---

## 4. Deliberate decisions / known gaps (DO NOT "fix" without asking)

- **No Intel macOS build** (`x86_64-apple-darwin`). Only Apple Silicon
  (aarch64). Intel would double macOS minutes (another ×10 runner). Revisit
  only if a user reports needing Intel.
- **Unsigned builds.** No code signing / notarization configured. macOS
  Gatekeeper will warn on first launch; Windows SmartScreen too. Signing needs
  certs + secrets; add deliberately, not as an afterthought.
- **Windows `.msi` only builds on Windows** (WiX is Windows-only). Cross-
  compiling Windows from Linux (`cargo-xwin`) is officially documented but
  "last resort" and produces NSIS only — the CI Windows runner is the correct
  Windows path, so no cargo-xwin anything in this repo.
- **WebView2 install mode**: default `downloadBootstrapper` on Windows.
  Increase to `embedBootstrapper`/`offlineInstaller` only if distribution
  needs offline/Windows 7 support.
- `tauri-action` is pinned **`@v1`** in BOTH workflows. Keep them the same
  major version.
- `releaseDraft: true` — releases are draft until manually published. Do not
  auto-publish; a broken auto-published release is worse than a delayed one.

---

## 5. Gotchas learned the hard way (keep these patterns intact)

- **Worker/asset URL bugs are the #1 build breaker.** Any `new Worker(new
  URL(...))` or wasm import path must resolve from the file that contains it
  (relative to `import.meta.url`), not from where the file "should" be. Example:
  `features/graph/hooks/useGraphEngine.ts` must reference
  `../lib/graphWorker.ts` (file lives in `lib/`, moved there by ADR-038).
  The `ci.yml` frontend build catches these on free Linux runners BEFORE the
  paid-OS matrix runs — don't delete that step.
- **Rust cache** (`Swatinem/rust-cache`, `workspaces: target`) is keyed per
  runner OS — Windows and macOS builds have their own caches. A cache hit is
  per-OS; "works on Linux CI" ≠ "cached on Windows".
- **`fail-fast: false`** in both matrix workflows — one OS failing must not
  cancel the others (max signal per run).
- **`concurrency` groups with `cancel-in-progress: true`** exist in both
  workflows — keep them; they stop wasted minutes on superseded pushes.
- No `Co-Authored-By` or any auto-generated trailer in commit messages (hard
  user rule).

---

## 6. Where this file sits

- Loaded explicitly for release/CI work. `docs/CURRENT_WORK.md` links it from
  the session-start handoff; keep that link if you edit either file.
- If the GitHub Free tier numbers change (they have before), update §2 from the
  official docs: `docs.github.com/en/actions/reference/limits`.