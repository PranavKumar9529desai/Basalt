// WebGL2 renderer for the note-link graph (ADR-021, Phase 3).
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


export interface GraphTransform {
  scale: number;
  ox: number;
  oy: number;
}

const VERT_SCENE = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec3 aColor;
layout(location = 2) in float aFlag;
uniform vec2 uResolution;
uniform float uScale;
uniform vec2 uOffset;
uniform float uDpr;
layout(location = 3) in float aSize;
out vec3 vColor;
out float vFlag;
void main() {
  vec2 screen = aPos * uScale + uOffset;
  vec2 clip = (screen / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = clamp(aSize * uScale, 2.0, 22.0) * uDpr;
  vColor = aColor;
  vFlag = aFlag;
}`;

const FRAG_POINTS = `#version 300 es
precision mediump float;
in vec3 vColor;
in float vFlag;
uniform float uHasHover;
out vec4 frag;
void main() {
  // Circular node mask (points are squares by default).
  vec2 d = gl_PointCoord - vec2(0.5);
  if (dot(d, d) > 0.25) discard;
  float a = (uHasHover > 0.5 && vFlag < 0.5) ? 0.22 : 1.0;
  frag = vec4(vColor * a, a);
}`;

const VERT_EDGE = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aEndpoints; // ax, ay, bx, by (world space)
layout(location = 2) in float aWeight;
uniform vec2 uResolution;
uniform float uScale;
uniform vec2 uOffset;
uniform float uDpr;
out float vWeight;
void main() {
  vec2 sA = aEndpoints.xy * uScale + uOffset;
  vec2 sB = aEndpoints.zw * uScale + uOffset;
  vec2 dir = sB - sA;
  float len = length(dir);
  vec2 n = len > 0.0 ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);
  float w = clamp(1.0 + 0.35 * aWeight, 1.0, 2.2) * uDpr;
  vec2 base = mix(sA, sB, (aCorner.x + 1.0) * 0.5);
  vec2 screen = base + n * (aCorner.y * w * 0.5);
  vec2 clip = (screen / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  vWeight = aWeight;
}`;

const FRAG_EDGE = `#version 300 es
precision mediump float;
in float vWeight;
uniform float uHasHover;
uniform vec3 uEdgeColor;
out vec4 frag;
void main() {
  // Heavier edges read slightly more opaque; all edges dim while a node is
  // hovered so the focused node's connections stand out.
  float a = clamp(0.14 + 0.07 * vWeight, 0.14, 0.38);
  a *= (uHasHover > 0.5 ? 0.55 : 1.0);
  frag = vec4(uEdgeColor, a);
}`;

const VERT_ARROW = `#version 300 es
layout(location = 0) in vec2 aPos;
uniform vec2 uResolution;
uniform float uScale;
uniform vec2 uOffset;
void main() {
  vec2 screen = aPos * uScale + uOffset;
  vec2 clip = (screen / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const FRAG_ARROW = `#version 300 es
precision mediump float;
uniform vec4 uArrowColor;
out vec4 frag;
void main() {
  frag = vec4(uArrowColor.rgb * uArrowColor.a, uArrowColor.a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) {
    throw new Error(
      "GraphRenderer: createShader returned null — WebGL2 context is lost (StrictMode remount on a reused canvas?)",
    );
  }
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const err = gl.getError();
    const lost = gl.isContextLost();
    const firstLine = src.split("\n")[0];
    const detail = [
      "GraphRenderer shader compile failed",
      `  firstLine: ${firstLine}`,
      `  infoLog: ${log ?? "<null>"}`,
      `  glError: ${err}`,
      `  contextLost: ${lost}`,
      `  source:\n${src}`,
    ].join("\n");
    console.error(detail);
    gl.deleteShader(sh);
    throw new Error(detail);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    const err = gl.getError();
    const detail = [
      "GraphRenderer program link failed",
      `  infoLog: ${log ?? "<null>"}`,
      `  glError: ${err}`,
    ].join("\n");
    console.error(detail);
    gl.deleteProgram(p);
    throw new Error(detail);
  }
  return p;
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
  private edgeColor: [number, number, number] = [0.5, 0.6, 0.78];
  private uEdgeColor: WebGLUniformLocation | null = null;
  private edgePairs: Uint32Array = new Uint32Array(0);
  private edgeEndpoints: Float32Array = new Float32Array(0);
  private arrowBuf: WebGLBuffer;
  private vaoScene: WebGLVertexArrayObject;
  private vaoEdges: WebGLVertexArrayObject;
  private vaoArrows: WebGLVertexArrayObject;

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
  private uEdgeRes: WebGLUniformLocation | null;
  private uEdgeScale: WebGLUniformLocation | null;
  private uEdgeOffset: WebGLUniformLocation | null;
  private uEdgeDpr: WebGLUniformLocation | null;
  private uEdgeHasHover: WebGLUniformLocation | null;
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
      typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    console.error("[graph] WebGL2 context probe", {
      isWebGL2,
      version: String(gl.getParameter(gl.VERSION)),
      shadingLanguage: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
      renderer: String(gl.getParameter(gl.RENDERER)),
      vendor: String(gl.getParameter(gl.VENDOR)),
      contextLost: gl.isContextLost(),
    });
    // Premultiplied-alpha compositing: transparent clear + dimmed hover edges blend correctly.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

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
    this.uEdgeRes = gl.getUniformLocation(this.progEdge, "uResolution");
    this.uEdgeScale = gl.getUniformLocation(this.progEdge, "uScale");
    this.uEdgeOffset = gl.getUniformLocation(this.progEdge, "uOffset");
    this.uEdgeDpr = gl.getUniformLocation(this.progEdge, "uDpr");
    this.uEdgeColor = gl.getUniformLocation(this.progEdge, "uEdgeColor");
    this.uEdgeHasHover = gl.getUniformLocation(this.progEdge, "uHasHover");
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
    gl.bindVertexArray(null);
    return vao;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setPositions(positions: Float32Array): void {
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

  render(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0); // transparent — geometry only; app theme shows through
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
    gl.deleteBuffer(this.posBuf);
    gl.deleteBuffer(this.colorBuf);
    gl.deleteBuffer(this.flagBuf);
    gl.deleteBuffer(this.sizeBuf);
    gl.deleteBuffer(this.edgeEndpointsBuf);
    gl.deleteBuffer(this.edgeWeightBuf);
    gl.deleteBuffer(this.edgeCornerBuf);
    gl.deleteBuffer(this.arrowBuf);
    gl.deleteVertexArray(this.vaoScene);
    gl.deleteVertexArray(this.vaoEdges);
    gl.deleteVertexArray(this.vaoArrows);
    gl.deleteProgram(this.progScene);
    gl.deleteProgram(this.progEdge);
    gl.deleteProgram(this.progArrows);
  }
}
