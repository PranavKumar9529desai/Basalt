# `@workspace/graph`

Framework-agnostic **WebGL2** renderer for the Basalt note-link graph. It is
the lowest layer of the graph stack: given a canvas and a set of typed-array
scene buffers it draws nodes, edges, and directional arrowheads. It contains
**no React, no Tauri, no business state** — it renders purely from position
buffers (the `packages/` litmus from `AGENTS.md`). The simulation, label
overlay, hit-testing, and dirty-gating that feed it live one layer up, in
`apps/tauri/src/graph/` (see [Relationship to the feature layer](#relationship-to-the-feature-layer)).

Exported surface: `GraphRenderer` and the `GraphTransform` type
(`src/index.ts`).

---

## Architecture decision: WebGL2 geometry + Canvas2D text (ADR-021)

The graph is drawn as **two stacked, transparent canvases plus a DOM tooltip**:

```
┌─────────────────────────────────────────────┐
│ DOM tooltip / context menu (top, pointer)   │
├─────────────────────────────────────────────┤
│ Canvas2D  — node text labels (transparent)  │  ← only when zoomed in
├─────────────────────────────────────────────┤
│ WebGL2    — points + lines + arrowheads      │  ← pure geometry, clears transparent
└─────────────────────────────────────────────┘
        app theme background shows through both
```

**Why not draw labels in WebGL?** Text in GL is painful: you must rasterize
glyphs to a texture atlas, manage SDFs or quad per glyph, and re-layout on
zoom. For a graph where labels are a _secondary_ cue (shown only past
`LABEL_SCALE` and below `LABEL_CAP` nodes), that cost is unjustified. Drawing
text on a transparent Canvas2D overlay is the canonical pattern used by
sigma.js, deck.gl, and Mapbox — geometry on the GPU, text on the 2D layer.
Because labels are **culled** (`v.scale > LABEL_SCALE && count < LABEL_CAP`),
the 2D canvas cost is `O(visible_labels)`, not `O(nodes)`.

**Why not Canvas2D for everything?** A 25k-node graph is ~25k point draws and
tens of thousands of line draws per frame — Canvas2D cannot sustain that at
60fps. WebGL batches the whole graph into **three draw calls** regardless of
node count.

---

## Scene model

Three GL primitives, three programs (the two "scene" programs share one vertex
shader; attribute locations 0/1/2 are identical so the VAOs are interchangeable):

| Primitive  | Program          | Buffer                            | Call                       |
| ---------- | ---------------- | --------------------------------- | -------------------------- |
| Nodes      | `progScene`      | `posBuf` / `colorBuf` / `flagBuf` | `drawArrays(POINTS, …)`    |
| Edges      | `progSceneLines` | same + `edgeIdxBuf` (indices)     | `drawElements(LINES, …)`   |
| Arrowheads | `progArrows`     | `arrowBuf`                        | `drawArrays(TRIANGLES, …)` |

- **Nodes** are `gl.POINTS` with a circular mask (`discard` outside the point's
  inscribed circle in the fragment shader). `gl_PointSize` scales with zoom and
  DPR, clamped to `[2, 14]` device px.
- **Edges** are `gl.LINES` drawn from an `ELEMENT_ARRAY_BUFFER` of `UNSIGNED_INT`
  index pairs — so a node's position is uploaded **once** and referenced by many
  edges (no duplicated vertex data).
- **Arrowheads** are one triangle per edge end, generated on the main-thread
  side (see [Relationship](#relationship-to-the-feature-layer)) and uploaded as
  a flat `Float32Array` of `(x, y)` verts.

Vertex attribute layout (shared by all scene VAOs):

```
location 0  aPos    vec2   world position
location 1  aColor  vec3   linear RGB
location 2  aFlag   float  0 = normal, 1 = hovered, 2 = neighbor
```

---

## Coordinate convention

The camera is `{ scale, ox, oy }` and matches the old Canvas2D proof:

```
screen_px = world * scale + offset        // offset in CSS pixels
clip      = (screen / resolution) * 2 - 1 // resolution in CSS px
clip.y    = -clip.y                        // GL y is up; screen y is down
```

`uDpr` is supplied so `gl_PointSize` is in **device** pixels
(`pointSize * uScale * uDpr`), keeping glyphs crisp on HiDPI while the rest of
the transform stays in CSS space.

---

## Buffer upload strategy: orphaning, not `bufferSubData`

Per-frame dynamic buffers (`setPositions`, `setFlags`, `setArrows`) use:

```ts
gl.bufferData(target, data, gl.DYNAMIC_DRAW);
```

This is **buffer orphaning**: each frame the driver discards the previous
backing store and allocates fresh storage, so the upload never blocks on a
buffer the GPU is still consuming.

**We deliberately avoided `bufferSubData` here.** A WebGL dev-list report
(documents a ~50% drop in _final_ render performance from per-frame
`bufferSubData` due to pipeline stalls when writing into a GPU-in-use buffer).
Orphaning sidesteps the stall at the cost of re-allocating GPU storage each
frame — cheap, and the recommended streaming pattern for data that changes
every frame.

Static buffers (`setColors`, `setEdges`) use `STATIC_DRAW` and are uploaded
once on rebuild.

> **Diagnostic probe:** the constructor logs a WebGL2 capability probe
> (`[graph] WebGL2 context probe`) before linking. A `webgl2` context can be
> returned even when the underlying driver only accepts GLSL ES 1.00, which
> makes `#version 300 es` fail to compile with a _null_ info log. The probe
> surfaces the truth (version / shading-language / renderer / vendor /
> context-lost) so a silent shader failure is diagnosable instead of a blank
> canvas.

---

## Premultiplied-alpha compositing

The renderer clears to **transparent** `(0, 0, 0, 0)` and enables:

```ts
gl.enable(gl.BLEND);
gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
```

Every fragment shader outputs **premultiplied** alpha — `frag = vec4(rgb * a, a)`
for points/edges, and `vec4(uArrowColor.rgb * uArrowColor.a, uArrowColor.a)` for
arrows. With `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` this composites correctly
over the app theme behind the canvas **and** lets dimmed hover edges
(`a = 0.06`) blend without the dark "halo" you get from straight-alpha
blending. The transparent clear is what makes the WebGL2 layer show the
workspace theme through the graph.

---

## Hover / highlight model

Highlighting is data-driven, not a second draw pass:

- `aFlag` per node: `1` = hovered, `2` = neighbor of hovered, `0` = other.
- `uHasHover` uniform gates the dimming math in the shaders.
- Points: non-hovered nodes drop to `a = 0.22` when something is hovered.
- Edges: the endpoint nearer the hovered node flares to `0.6`, the far end
  fades to `0.06`, giving a directional "flare" along each incident edge.

Flags are uploaded via `setFlags` only when they change (`flagsDirtyRef` on the
feature side), not every frame.

---

## API (`GraphRenderer`)

| Method                                      | When to call                                          |
| ------------------------------------------- | ----------------------------------------------------- |
| `constructor(canvas)`                       | once; throws if WebGL2 unavailable                    |
| `resize(cssW, cssH, dpr)`                   | on layout change; sets `gl.viewport`                  |
| `setPositions(Float32Array)`                | every frame (orphaned `DYNAMIC_DRAW`)                 |
| `setColors(Float32Array)`                   | on rebuild (`STATIC_DRAW`)                            |
| `setFlags(Float32Array)`                    | on hover change (`DYNAMIC_DRAW`)                      |
| `setEdges(Uint32Array, count)`              | on rebuild (`STATIC_DRAW`)                            |
| `setArrows(Float32Array)`                   | throttled (see feature layer)                         |
| `setView({ scale, ox, oy })`                | every frame                                           |
| `setHasHover(bool)` / `setShowArrows(bool)` | on hover / toggle                                     |
| `render()`                                  | every dirty frame                                     |
| `dispose()`                                 | on unmount; deletes GL objects (**no** `loseContext`) |

`render()` issues exactly three draws (points, then lines if any edges, then
triangles if arrows are shown) and early-returns when `nodeCount === 0`.

---

## Relationship to the feature layer

This package is the dumb drawing surface. Everything that decides _what_ to
draw lives in `apps/tauri/src/graph/`:

- **`GraphWorker.ts`** — a **Web Worker** running the WASM force simulation;
  posts `Float32Array` positions to the main thread. The expensive node physics
  is already off the UI thread.
- **`Graph.tsx`** — owns the sim worker, the Canvas2D label overlay, and
  the per-frame orchestration: it calls `setPositions` / `setView` / `setFlags`
  / `setArrows` then `render()`.
- **`spatialGrid.ts`** — `SpatialGrid`, a screen-space uniform grid used for
  **O(local) hover hit-testing** (replacing an O(node-count) scan per
  `mousemove`). Built each render, reused while idle.
- **Render-on-dirty** — the rAF loop redraws only when something changed (new
  sim frame, camera move, hover, resize, rebuild). Once the sim cools the worker
  stops posting frames, so an idle graph costs zero GPU/CPU work.
- **Arrow throttling** — arrowheads depend on positions _and_ zoom, so they are
  rebuilt only when a new frame arrives or zoom changes meaningfully, written
  into a reused `Float32Array`.

These decisions are documented there; this README covers _why the renderer
itself_ is shaped the way it is.

---

## Performance target & verification

Designed for **≥25k nodes at ≥60fps** (the `AGENTS.md` power-user scale; see
ADR-020). The cost is `O(draw calls + visible_labels)`, independent of node
count for geometry. Verified statically via `tsc`/`oxlint`; interactive feel
(hover/click/pan at full vault scale, idle GPU idle) is confirmed manually with
`bun run dev`.
