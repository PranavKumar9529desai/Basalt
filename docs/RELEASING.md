# Releasing Basalt

This guide outlines how to release new versions of Basalt using our automated GitHub Actions release workflow.

---

## 1. Automated Release Pipeline

Whenever a git tag starting with `v` (e.g. `v0.1.0`) is pushed to GitHub, `.github/workflows/release.yml` automatically triggers a multi-platform release build:

- **Linux (x86_64):** Builds `.AppImage` and `.deb` bundles.
- **Windows (x86_64):** Builds `.msi` installer and standalone `.exe`.
- **macOS (Apple Silicon & Intel):** Builds `.dmg` installers.

The workflow compiles with all production optimizations (`opt-level = 3`, `lto = "fat"`, `mimalloc`, React 19 Compiler, chunk splitting) and creates a **draft GitHub Release** on your repository with the download binaries attached and an auto-generated changelog.

---

## 2. Release Steps

1. **Verify Working Tree:**
   Ensure all tests and lint checks pass:

   ```bash
   bun run lint
   cd apps/tauri && bunx tsc --noEmit
   cargo test --workspace
   ```

2. **Create and Push the Tag:**

   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0"
   git push origin v0.1.0
   ```

3. **Publish the Release on GitHub:**
   - Go to `https://github.com/PranavKumar9529desai/Basalt/releases`.
   - Open the newly generated Draft Release.
   - Review the release notes and attached installers.
   - Click **Publish release**.

---

## 3. Manual Release Trigger

You can also trigger a release build manually without a tag:

1. Navigate to **Actions** → **Release** in GitHub.
2. Click **Run workflow** on the `main` branch.
