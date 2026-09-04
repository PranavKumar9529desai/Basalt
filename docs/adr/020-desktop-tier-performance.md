# ADR-020: Desktop-Tier Performance Architecture

**Status:** Accepted (moves 1 & 5 implemented; 2–4, 6 proposed)
**Date:** 2026-08-24

## Context

Web-standard React optimizations (`React.lazy`, virtualization, selector
discipline) are table stakes — every checklist has them. Beating Obsidian by
a _margin_ for power users with super-large vaults (≥25k notes — our target
userbase per AGENTS.md) requires desktop-tier techniques that exploit the
Tauri split: **Rust is the backend; the webview is a display surface.**

Guiding invariant: _JS renders pixels; Rust owns every byte of truth. React
never touches data at scale._ The typing path already obeys this (CM6, zero
re-renders). This ADR extends it to startup and bulk data.

## Decision: six moves

### 1. Speculative parallel boot ✅ IMPLEMENTED

The webview takes ~570ms to spawn; today `boot` runs only _after_ it loads.
Serial waste. Instead, `setup()` spawns a thread that performs the full boot
pipeline (vault load/index, watcher, search init, tree build) while WebKit
boots in parallel. The `boot` invoke serves the cached result from
`PREBOOT` (module-level `Mutex<Option<BootResult>>`, lock held during
compute → invoke blocks until ready or computes inline as fallback).

```
before: [spawn ──570ms──> webview] ──> [boot 170ms] ──> render
after:  [spawn ──> boot pipeline starts immediately]
        [spawn ──570ms──> webview] ──> boot ≈ 0ms ──> render
```

A web app cannot do this. Expected: −150ms+ off launch.

### 2. Hidden-until-painted window ✅ IMPLEMENTED

Window created `"visible": false`; frontend calls `show()` only after the
workspace has actually painted (double-rAF mark in `WorkspaceInit`). Rust
runs a 10s failsafe timer that shows the window regardless (JS failure must
never yield an invisible app). Kills the white-flash and improves perceived
launch even when real time is unchanged.

### 3. Binary IPC for bulk payloads (proposed)

Everything through `invoke` is serde-JSON serialized (per official Tauri
docs, this "slows down your application" for large returns). For bulk
payloads — vault tree, graph node/edge dumps, search result pages —
serialize with bincode/postcard in Rust, return via
`tauri::ipc::Response::new(bytes)` (raw, skips JSON), decode in the
frontend into typed arrays. Matters at ≥10k notes; do with graph view.

### 4. WASM compute + worker rendering (proposed)

Interactive-rate work that must live in the webview compiles FROM our own
crates: `basalt-graph` → WASM running force-directed physics inside a Web
Worker, streaming positions via typed arrays to a canvas/WebGL renderer.
Zero React involvement per frame. `graph-wasm` exists for exactly this.

### 5. Rust-windowed virtualization protocol (proposed)

Collections don't cross IPC in full. Frontend asks Rust for slices
("rows 500–550 sorted by X"); Rust answers from its arena. For hub notes
with thousands of backlinks and large search result sets. Tree stays
whole-shipped (flat array); backlinks/graph get paged.

### 6. Channel event streams (proposed)

Replace bursty event emission with `tauri::ipc::Channel`: one ordered
stream the frontend coalesces. A git checkout over a 25k vault fires
hundreds of watcher events; React must see one batched update per frame,
not hundreds. Adopt after profiling shows real jank.

## Consequences

- Launch path loses its serial dependency on webview startup
- No white flash; perceived launch ≈ real launch
- Bulk-data surfaces scale to ≥25k notes without JSON taxes
  − Preboot thread duplicates work if user picks a different vault within the
  first seconds (benign; `set_vault` clears the cache)
  − Window invisible until JS paints — mitigated by the 10s Rust failsafe

## Verification

- TTI report (`/tmp/basalt-reports/tti-report.md`) before/after: watch
  `loader: invoke(boot) round-trip` collapse toward 0 on warm boots.
- Criterion benches at the ≥25k fixture tier (AGENTS.md rule) for any
  bulk-payload change.
