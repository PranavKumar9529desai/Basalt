// WebGL2 renderer for the infinite canvas viewport.
//
// Framework-agnostic: given a canvas + typed-array scene buffers it draws
// node/group rectangles (instanced gl.TRIANGLES quads), connection edges
// (instanced quads), and directional arrowheads (gl.TRIANGLES). No React, no
// Tauri, no business state — it renders purely from geometry buffers (the
// `packages/` litmus). The JSON Canvas document lives one layer up and is
// projected onto these buffers by the owning view.
//
// Coordinate convention matches the graph renderer (packages/graph): the
// camera is `{ scale, ox, oy }` where screen_px = world * scale + offset, with
// the offset in CSS pixels. The clip-space transform divides by the CSS
// resolution, so DPR only affects crispness, not layout.

export interface CanvasTransform {
  scale: number;
  ox: number;
  oy: number;
}

import {
  VERT_RECT,
  FRAG_RECT,
  VERT_EDGE,
  FRAG_EDGE,
  VERT_ARROW,
  FRAG_ARROW,
} from "./shaders";
import { link } from "./programs";

/** The two unit-quad corners (two triangles = 6 verts) shared by every rect
 * and edge instance. */
const UNIT_QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]);

export class CanvasViewportRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;

  private progRect: WebGLProgram;
  private progEdge: WebGLProgram;
  private progArrow: WebGLProgram;

  // Node rect buffers + VAO.
  private nodePosBuf: WebGLBuffer;
  private nodeSizeBuf: WebGLBuffer;
  private nodeColorBuf: WebGLBuffer;
  private nodeAlphaBuf: WebGLBuffer;
  private vaoNodes: WebGLVertexArrayObject;

  // Group rect buffers + VAO (same layout as nodes; drawn first).
  private groupPosBuf: WebGLBuffer;
  private groupSizeBuf: WebGLBuffer;
  private groupColorBuf: WebGLBuffer;
  private groupAlphaBuf: WebGLBuffer;
  private vaoGroups: WebGLVertexArrayObject;

  // Edge buffers + VAO.
  private edgeMidBuf: WebGLBuffer;
  private edgeDirBuf: WebGLBuffer;
  private edgeColorBuf: WebGLBuffer;
  private edgeAlphaBuf: WebGLBuffer;
  private vaoEdges: WebGLVertexArrayObject;

  // Arrow buffers + VAO.
  private arrowBuf: WebGLBuffer;
  private vaoArrows: WebGLVertexArrayObject;

  private nodeCount = 0;
  private groupCount = 0;
  private edgeCount = 0;
  private arrowVertCount = 0;
  private showArrows = true;

  private view: CanvasTransform = { scale: 1, ox: 0, oy: 0 };
  private cssW = 800;
  private cssH = 600;
  private dpr = 1;
  private edgeWidth = 1;

  private lost = false;
  private resourcesNeedRebuild = false;
  private readonly onContextLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };
  private readonly onContextRestored = () => {
    this.lost = false;
    this.resourcesNeedRebuild = true;
  };

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("CanvasViewport: WebGL2 is not available");
    this.gl = gl;
    this.canvas = canvas;

    // Transparent clear + premultiplied-alpha compositing so the app theme
    // shows through the canvas layer (same contract as the graph renderer).
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    canvas.addEventListener(
      "webglcontextrestored",
      this.onContextRestored,
      false,
    );
    this.lost = gl.isContextLost();

    this.progRect = link(gl, VERT_RECT, FRAG_RECT);
    this.progEdge = link(gl, VERT_EDGE, FRAG_EDGE);
    this.progArrow = link(gl, VERT_ARROW, FRAG_ARROW);

    // Unit quad corner buffer is shared; each VAO wires it to location 0.
    const cornerBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW);

    this.nodePosBuf = gl.createBuffer()!;
    this.nodeSizeBuf = gl.createBuffer()!;
    this.nodeColorBuf = gl.createBuffer()!;
    this.nodeAlphaBuf = gl.createBuffer()!;
    this.vaoNodes = this.buildQuadVao(
      cornerBuf,
      this.nodePosBuf,
      this.nodeSizeBuf,
      this.nodeColorBuf,
      this.nodeAlphaBuf,
    );

    this.groupPosBuf = gl.createBuffer()!;
    this.groupSizeBuf = gl.createBuffer()!;
    this.groupColorBuf = gl.createBuffer()!;
    this.groupAlphaBuf = gl.createBuffer()!;
    this.vaoGroups = this.buildQuadVao(
      cornerBuf,
      this.groupPosBuf,
      this.groupSizeBuf,
      this.groupColorBuf,
      this.groupAlphaBuf,
    );

    this.edgeMidBuf = gl.createBuffer()!;
    this.edgeDirBuf = gl.createBuffer()!;
    this.edgeColorBuf = gl.createBuffer()!;
    this.edgeAlphaBuf = gl.createBuffer()!;
    this.vaoEdges = this.buildEdgeVao(cornerBuf);

    this.arrowBuf = gl.createBuffer()!;
    this.vaoArrows = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoArrows);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** Build a VAO for a rect program (nodes or groups): corner (loc 0) is
   * per-vertex; pos/size/color/alpha are per-instance. */
  private buildQuadVao(
    cornerBuf: WebGLBuffer,
    posBuf: WebGLBuffer,
    sizeBuf: WebGLBuffer,
    colorBuf: WebGLBuffer,
    alphaBuf: WebGLBuffer,
  ): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
    return vao;
  }

  private buildEdgeVao(cornerBuf: WebGLBuffer): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeMidBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeDirBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeColorBuf);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeAlphaBuf);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
    return vao;
  }

  needsResourceRebuild(): boolean {
    return this.resourcesNeedRebuild;
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

  setView(t: CanvasTransform): void {
    this.view = t;
  }

  setEdgeWidth(px: number): void {
    this.edgeWidth = px;
  }

  setShowArrows(v: boolean): void {
    this.showArrows = v;
  }

  // --- Node rect uploads -----------------------------------------------------

  setNodes(
    positions: Float32Array,
    sizes: Float32Array,
    colors: Float32Array,
    alphas: Float32Array,
  ): void {
    if (this.lost) return;
    const gl = this.gl;
    this.nodeCount = positions.length >> 1;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodePosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeSizeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeColorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeAlphaBuf);
    gl.bufferData(gl.ARRAY_BUFFER, alphas, gl.DYNAMIC_DRAW);
  }

  // --- Group rect uploads (drawn behind nodes) -------------------------------

  setGroups(
    positions: Float32Array,
    sizes: Float32Array,
    colors: Float32Array,
    alphas: Float32Array,
  ): void {
    if (this.lost) return;
    const gl = this.gl;
    this.groupCount = positions.length >> 1;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groupPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groupSizeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groupColorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groupAlphaBuf);
    gl.bufferData(gl.ARRAY_BUFFER, alphas, gl.DYNAMIC_DRAW);
  }

  // --- Edge uploads ----------------------------------------------------------

  /** `mids` = (ax+ bx)/2, (ay+by)/2 per edge; `dirs` = (bx-ax, by-ay). */
  setEdges(
    mids: Float32Array,
    dirs: Float32Array,
    colors: Float32Array,
    alphas: Float32Array,
  ): void {
    if (this.lost) return;
    const gl = this.gl;
    this.edgeCount = mids.length >> 1;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeMidBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mids, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeDirBuf);
    gl.bufferData(gl.ARRAY_BUFFER, dirs, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeColorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeAlphaBuf);
    gl.bufferData(gl.ARRAY_BUFFER, alphas, gl.DYNAMIC_DRAW);
  }

  setArrows(arrows: Float32Array): void {
    if (this.lost) return;
    const gl = this.gl;
    this.arrowVertCount = arrows.length >> 1;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arrows, gl.DYNAMIC_DRAW);
  }

  render(): void {
    if (this.lost) return;
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    const v = this.view;

    // Groups first (z = 0): colored backgrounds behind nodes/edges.
    if (this.groupCount > 0) {
      gl.useProgram(this.progRect);
      gl.uniform2f(
        this.uniform(gl, this.progRect, "uResolution"),
        this.cssW,
        this.cssH,
      );
      gl.uniform1f(this.uniform(gl, this.progRect, "uScale"), v.scale);
      gl.uniform2f(this.uniform(gl, this.progRect, "uOffset"), v.ox, v.oy);
      gl.bindVertexArray(this.vaoGroups);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.groupCount);
    }

    // Edges under nodes.
    if (this.edgeCount > 0) {
      gl.useProgram(this.progEdge);
      gl.uniform2f(
        this.uniform(gl, this.progEdge, "uResolution"),
        this.cssW,
        this.cssH,
      );
      gl.uniform1f(this.uniform(gl, this.progEdge, "uScale"), v.scale);
      gl.uniform2f(this.uniform(gl, this.progEdge, "uOffset"), v.ox, v.oy);
      gl.uniform1f(this.uniform(gl, this.progEdge, "uDpr"), this.dpr);
      gl.uniform1f(
        this.uniform(gl, this.progEdge, "uEdgeWidth"),
        this.edgeWidth,
      );
      gl.bindVertexArray(this.vaoEdges);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.edgeCount);
    }

    // Nodes on top.
    if (this.nodeCount > 0) {
      gl.useProgram(this.progRect);
      gl.bindVertexArray(this.vaoNodes);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.nodeCount);
    }

    // Arrowheads above all.
    if (this.showArrows && this.arrowVertCount > 0) {
      gl.useProgram(this.progArrow);
      gl.uniform2f(
        this.uniform(gl, this.progArrow, "uResolution"),
        this.cssW,
        this.cssH,
      );
      gl.uniform1f(this.uniform(gl, this.progArrow, "uScale"), v.scale);
      gl.uniform2f(this.uniform(gl, this.progArrow, "uOffset"), v.ox, v.oy);
      gl.uniform4f(
        this.uniform(gl, this.progArrow, "uColor"),
        0.6,
        0.65,
        0.75,
        0.8,
      );
      gl.bindVertexArray(this.vaoArrows);
      gl.drawArrays(gl.TRIANGLES, 0, this.arrowVertCount);
    }
  }

  /** Uniform lookup is cheap relative to the draw; kept inline for clarity. */
  private uniform(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    name: string,
  ): WebGLUniformLocation {
    const loc = gl.getUniformLocation(program, name);
    if (!loc) throw new Error(`CanvasViewport: uniform '${name}' not found`);
    return loc;
  }

  dispose(): void {
    const gl = this.gl;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.onContextRestored,
    );
    for (const buf of [
      this.nodePosBuf,
      this.nodeSizeBuf,
      this.nodeColorBuf,
      this.nodeAlphaBuf,
      this.groupPosBuf,
      this.groupSizeBuf,
      this.groupColorBuf,
      this.groupAlphaBuf,
      this.edgeMidBuf,
      this.edgeDirBuf,
      this.edgeColorBuf,
      this.edgeAlphaBuf,
      this.arrowBuf,
    ]) {
      gl.deleteBuffer(buf);
    }
    gl.deleteVertexArray(this.vaoNodes);
    gl.deleteVertexArray(this.vaoGroups);
    gl.deleteVertexArray(this.vaoEdges);
    gl.deleteVertexArray(this.vaoArrows);
    gl.deleteProgram(this.progRect);
    gl.deleteProgram(this.progEdge);
    gl.deleteProgram(this.progArrow);
  }
}
