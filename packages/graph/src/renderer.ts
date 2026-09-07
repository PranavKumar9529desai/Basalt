// WebGL2 renderer for the note-link graph.
//
// Framework-agnostic: given a canvas + typed-array scene buffers it draws
// nodes (gl.POINTS), edges (instanced gl.TRIANGLES quads) and directional arrowheads (gl.TRIANGLES)
// and is expected to sustain >=60fps at >=25k nodes. No React, no Tauri, no
// business state — it renders purely from position buffers (the packages/
// litmus). The simulation positions are uploaded every frame; colors/edges on
// rebuild; flags on hover.
//
// Coordinate convention matches the old Canvas2D proof: the camera is
// { scale, ox, oy } where screen_px = world * scale + offset, with the offset in
// CSS pixels. The clip-space transform divides by the CSS resolution, so DPR
// only affects point size (device pixels).

import {
  VERT_SCENE,
  FRAG_POINTS,
  VERT_EDGE,
  FRAG_EDGE,
  VERT_ARROW,
  FRAG_ARROW,
} from "./shaders";
import { link } from "./programs";
export interface GraphTransform {
  scale: number;
  ox: number;
  oy: number;
}

export class GraphRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private progScene: WebGLProgram;
  private progEdge: WebGLProgram;
  private progArrows: WebGLProgram;
  private posBuf: WebGLBuffer;
  private colorBuf: WebGLBuffer;
  private flagBuf: WebGLBuffer;
  private sizeBuf: WebGLBuffer;
  private edgeEndpointsBuf: WebGLBuffer;
  private edgeWeightBuf: WebGLBuffer;
  private edgeCornerBuf: WebGLBuffer;
  private edgeFlagBuf!: WebGLBuffer;
  private edgeColor: [number, number, number] = [0.5, 0.6, 0.78];
  private hoverAccent: [number, number, number] = [0.3, 0.76, 1];
  private hoverRing: [number, number, number] = [0.9, 0.93, 0.95];
  private uEdgeColor: WebGLUniformLocation | null = null;
  private edgePairs: Uint32Array = new Uint32Array(0);
  private edgeEndpoints: Float32Array = new Float32Array(0);
  private arrowBuf: WebGLBuffer;
  private vaoScene: WebGLVertexArrayObject;
  private vaoEdges: WebGLVertexArrayObject;
  private vaoArrows: WebGLVertexArrayObject;

  // Track WebGL context loss via canvas events instead of polling
  // gl.isContextLost() in the per-frame path (which would add a sync query every
  // redraw). While lost, every GL call is a safe no-op but would be wasted work,
  // so render()/resize()/uploads bail out early. The owning app is responsible
  // for rebuilding the renderer on context restore.
  private lost = false;
  private readonly onContextLost = (e: Event) => {
    e.preventDefault(); // allow the context to be restored
    this.lost = true;
  };
  private readonly onContextRestored = () => {
    this.lost = false;
    // WebGL objects are invalid after restoration. The owning view must call
    // rebuildResources() before the next render.
    this.resourcesNeedRebuild = true;
  };

  private resourcesNeedRebuild = false;

  needsResourceRebuild(): boolean {
    return this.resourcesNeedRebuild;
  }

  private cssW = 800;
  private cssH = 600;
  private dpr = 1;
  private nodeCount = 0;
  private edgeCount = 0;
  private arrowVertCount = 0;
  private showArrows = true;
  private hasHover = false;
  private view: GraphTransform = { scale: 1, ox: 0, oy: 0 };

  // Uniform locations (locations are per-program, so each program has its own set).
  private uSceneRes: WebGLUniformLocation | null;
  private uSceneScale: WebGLUniformLocation | null;
  private uSceneOffset: WebGLUniformLocation | null;
  private uSceneDpr: WebGLUniformLocation | null;
  private uSceneHasHover: WebGLUniformLocation | null;
  private uSceneAccent: WebGLUniformLocation | null;
  private uSceneRing: WebGLUniformLocation | null;
  private uEdgeRes: WebGLUniformLocation | null;
  private uEdgeScale: WebGLUniformLocation | null;
  private uEdgeOffset: WebGLUniformLocation | null;
  private uEdgeDpr: WebGLUniformLocation | null;
  private uEdgeHasHover: WebGLUniformLocation | null;
  private uEdgeAccent: WebGLUniformLocation | null;
  private uArrowRes: WebGLUniformLocation | null;
  private uArrowScale: WebGLUniformLocation | null;
  private uArrowOffset: WebGLUniformLocation | null;
  private uArrowColor: WebGLUniformLocation | null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("GraphRenderer: WebGL2 is not available");
    this.gl = gl;
    this.canvas = canvas;

    // Diagnostic probe: a "webgl2" context can be returned even when the
    // underlying driver only accepts GLSL ES 1.00 — which makes #version 300 es
    // fail to compile with a null info log. Surface the truth before linking.
    const isWebGL2 =
      typeof WebGL2RenderingContext !== "undefined" &&
      gl instanceof WebGL2RenderingContext;
    console.debug("[graph] WebGL2 context probe", {
      isWebGL2,
      version: String(gl.getParameter(gl.VERSION)),
      shadingLanguage: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
      renderer: String(gl.getParameter(gl.RENDERER)),
      vendor: String(gl.getParameter(gl.VENDOR)),
      contextLost: gl.isContextLost(),
    });
    // Context-loss tracking so the hot path can bail without per-frame GL queries.
    this.lost = gl.isContextLost();
    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    canvas.addEventListener(
      "webglcontextrestored",
      this.onContextRestored,
      false,
    );
    // Premultiplied-alpha compositing: transparent clear + dimmed hover edges blend correctly.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Transparent clear — geometry only; app theme shows through.
    gl.clearColor(0, 0, 0, 0);

    this.progScene = link(gl, VERT_SCENE, FRAG_POINTS);
    // Re-link the LINE fragment variant against the same scene vertex shader;
    // attribute locations (0,1,2) are identical so the VAOs are shared.
    this.progEdge = link(gl, VERT_EDGE, FRAG_EDGE);
    this.progArrows = link(gl, VERT_ARROW, FRAG_ARROW);

    this.posBuf = gl.createBuffer()!;
    this.colorBuf = gl.createBuffer()!;
    this.flagBuf = gl.createBuffer()!;
    this.sizeBuf = gl.createBuffer()!;
    this.edgeEndpointsBuf = gl.createBuffer()!;
    this.edgeWeightBuf = gl.createBuffer()!;
    this.edgeCornerBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeCornerBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]),
      gl.STATIC_DRAW,
    );
    this.arrowBuf = gl.createBuffer()!;

    this.vaoScene = this.buildSceneVao();
    this.vaoEdges = this.buildEdgeVao();
    this.vaoArrows = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoArrows);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.uSceneRes = gl.getUniformLocation(this.progScene, "uResolution");
    this.uSceneScale = gl.getUniformLocation(this.progScene, "uScale");
    this.uSceneOffset = gl.getUniformLocation(this.progScene, "uOffset");
    this.uSceneDpr = gl.getUniformLocation(this.progScene, "uDpr");
    this.uSceneHasHover = gl.getUniformLocation(this.progScene, "uHasHover");
    this.uSceneAccent = gl.getUniformLocation(this.progScene, "uAccent");
    this.uSceneRing = gl.getUniformLocation(this.progScene, "uRing");
    this.uEdgeRes = gl.getUniformLocation(this.progEdge, "uResolution");
    this.uEdgeScale = gl.getUniformLocation(this.progEdge, "uScale");
    this.uEdgeOffset = gl.getUniformLocation(this.progEdge, "uOffset");
    this.uEdgeDpr = gl.getUniformLocation(this.progEdge, "uDpr");
    this.uEdgeColor = gl.getUniformLocation(this.progEdge, "uEdgeColor");
    this.uEdgeHasHover = gl.getUniformLocation(this.progEdge, "uHasHover");
    this.uEdgeAccent = gl.getUniformLocation(this.progEdge, "uEdgeAccent");
    this.uArrowRes = gl.getUniformLocation(this.progArrows, "uResolution");
    this.uArrowScale = gl.getUniformLocation(this.progArrows, "uScale");
    this.uArrowOffset = gl.getUniformLocation(this.progArrows, "uOffset");
    this.uArrowColor = gl.getUniformLocation(this.progArrows, "uArrowColor");
  }

  private buildSceneVao(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.flagBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuf);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  private buildEdgeVao(): WebGLVertexArrayObject {
    this.edgeFlagBuf = this.gl.createBuffer()!;
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    // Per-vertex corner of the rectangle (-1..1 on each axis).
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeCornerBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // Per-instance endpoint positions (ax, ay, bx, by), refreshed each frame.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeEndpointsBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    // Per-instance connection weight (drives thickness + opacity).
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeWeightBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);
    // Per-instance hover flag: 1 when this edge touches the hovered node.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeFlagBuf);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
    return vao;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    if (this.lost) return;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setPositions(positions: Float32Array): void {
    if (this.lost) return;
    const gl = this.gl;
    this.nodeCount = positions.length >> 1;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    if (this.edgeCount > 0) this.updateEdgeEndpoints(positions);
  }

  setColors(colors: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  }

  setFlags(flags: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.flagBuf);
    gl.bufferData(gl.ARRAY_BUFFER, flags, gl.DYNAMIC_DRAW);
  }
  setEdgeFlags(flags: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeFlagBuf);
    gl.bufferData(gl.ARRAY_BUFFER, flags, gl.DYNAMIC_DRAW);
  }

  setSizes(sizes: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);
  }

  setEdges(edges: Uint32Array, edgeCount: number): void {
    this.edgePairs = edges;
    this.edgeCount = edgeCount;
    if (this.edgeEndpoints.length !== edgeCount * 4) {
      this.edgeEndpoints = new Float32Array(edgeCount * 4);
    }
  }

  setEdgeWeights(weights: Float32Array): void {
    if (this.edgeCount > 0) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeWeightBuf);
      gl.bufferData(gl.ARRAY_BUFFER, weights, gl.STATIC_DRAW);
    }
  }

  private updateEdgeEndpoints(positions: Float32Array): void {
    const n = this.edgeCount;
    if (n === 0) return;
    const buf = this.edgeEndpoints;
    const pairs = this.edgePairs;
    for (let e = 0; e < n; e++) {
      const u = pairs[e * 2];
      const v = pairs[e * 2 + 1];
      buf[e * 4] = positions[u * 2];
      buf[e * 4 + 1] = positions[u * 2 + 1];
      buf[e * 4 + 2] = positions[v * 2];
      buf[e * 4 + 3] = positions[v * 2 + 1];
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeEndpointsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW);
  }

  setArrows(arrows: Float32Array): void {
    const gl = this.gl;
    this.arrowVertCount = arrows.length / 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arrows, gl.DYNAMIC_DRAW);
  }

  setView(t: GraphTransform): void {
    this.view = t;
  }

  setHasHover(v: boolean): void {
    this.hasHover = v;
  }

  setShowArrows(v: boolean): void {
    this.showArrows = v;
  }
  setEdgeColor(c: [number, number, number]): void {
    this.edgeColor = c;
  }

  setHoverColors(
    accent: [number, number, number],
    ring: [number, number, number],
  ): void {
    this.hoverAccent = accent;
    this.hoverRing = ring;
  }

  render(): void {
    if (this.lost) return;
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.nodeCount === 0) return;

    const v = this.view;

    // Edges (instanced variable-width quads; weight drives thickness). Drawn
    // first so nodes sit on top of their connections.
    if (this.edgeCount > 0) {
      gl.useProgram(this.progEdge);
      gl.uniform2f(this.uEdgeRes, this.cssW, this.cssH);
      gl.uniform1f(this.uEdgeScale, v.scale);
      gl.uniform2f(this.uEdgeOffset, v.ox, v.oy);
      gl.uniform1f(this.uEdgeDpr, this.dpr);
      gl.uniform1f(this.uEdgeHasHover, this.hasHover ? 1 : 0);
      gl.uniform3fv(this.uEdgeColor, this.edgeColor);
      gl.uniform3fv(this.uEdgeAccent, this.hoverAccent);
      gl.bindVertexArray(this.vaoEdges);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.edgeCount);
    }

    // Nodes (points) + hover highlight.
    gl.useProgram(this.progScene);
    gl.uniform2f(this.uSceneRes, this.cssW, this.cssH);
    gl.uniform1f(this.uSceneScale, v.scale);
    gl.uniform2f(this.uSceneOffset, v.ox, v.oy);
    gl.uniform1f(this.uSceneDpr, this.dpr);
    gl.uniform1f(this.uSceneHasHover, this.hasHover ? 1 : 0);
    gl.uniform3fv(this.uSceneAccent, this.hoverAccent);
    gl.uniform3fv(this.uSceneRing, this.hoverRing);
    gl.bindVertexArray(this.vaoScene);
    gl.drawArrays(gl.POINTS, 0, this.nodeCount);

    // Directional arrowheads.
    if (this.showArrows && this.arrowVertCount > 0) {
      gl.useProgram(this.progArrows);
      gl.uniform2f(this.uArrowRes, this.cssW, this.cssH);
      gl.uniform1f(this.uArrowScale, v.scale);
      gl.uniform2f(this.uArrowOffset, v.ox, v.oy);
      gl.uniform4f(
        this.uArrowColor,
        0.47,
        this.hasHover ? 0.78 : 0.55,
        this.hasHover ? 1.0 : 0.67,
        this.hasHover ? 0.85 : 0.5,
      );
      gl.bindVertexArray(this.vaoArrows);
      gl.drawArrays(gl.TRIANGLES, 0, this.arrowVertCount);
    }
  }

  dispose(): void {
    const gl = this.gl;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.onContextRestored,
    );
    gl.deleteBuffer(this.posBuf);
    gl.deleteBuffer(this.colorBuf);
    gl.deleteBuffer(this.flagBuf);
    gl.deleteBuffer(this.sizeBuf);
    gl.deleteBuffer(this.edgeEndpointsBuf);
    gl.deleteBuffer(this.edgeWeightBuf);
    gl.deleteBuffer(this.edgeCornerBuf);
    gl.deleteBuffer(this.edgeFlagBuf);
    gl.deleteBuffer(this.arrowBuf);
    gl.deleteVertexArray(this.vaoScene);
    gl.deleteVertexArray(this.vaoEdges);
    gl.deleteVertexArray(this.vaoArrows);
    gl.deleteProgram(this.progScene);
    gl.deleteProgram(this.progEdge);
    gl.deleteProgram(this.progArrows);
  }
}
