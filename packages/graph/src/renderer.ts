// WebGL2 renderer for the note-link graph (ADR-021, Phase 3).
//
// Framework-agnostic: given a canvas + typed-array scene buffers it draws
// nodes (gl.POINTS), edges (gl.LINES) and directional arrowheads (gl.TRIANGLES)
// and is expected to sustain >=60fps at >=25k nodes. No React, no Tauri, no
// business state — it renders purely from position buffers (the packages/
// litmus). The simulation positions are uploaded every frame; colors/edges on
// rebuild; flags on hover.
//
// Coordinate convention matches the old Canvas2D proof: the camera is
// { scale, ox, oy } where screen_px = world * scale + offset, with the offset in
// CSS pixels. The clip-space transform divides by the CSS resolution, so DPR
// only affects point size (device pixels).

const NODE_R = 2.6; // node radius in screen px (matches GraphView)

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
uniform float uPointSize;
out vec3 vColor;
out float vFlag;
void main() {
  vec2 screen = aPos * uScale + uOffset;
  vec2 clip = (screen / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = clamp(uPointSize * uScale, 2.0, 14.0) * uDpr;
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

const FRAG_LINES = `#version 300 es
precision mediump float;
in vec3 vColor;
in float vFlag;
uniform float uHasHover;
out vec4 frag;
void main() {
  // Edge alpha interpolates between endpoints, so an edge touching the hovered
  // node flares bright and fades toward its dim neighbor.
  float a = (uHasHover > 0.5)
    ? ((vFlag > 0.5) ? 0.6 : 0.06)
    : 0.22;
  frag = vec4(vColor * a, a);
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
  private progSceneLines: WebGLProgram;
  private progArrows: WebGLProgram;
  private posBuf: WebGLBuffer;
  private colorBuf: WebGLBuffer;
  private flagBuf: WebGLBuffer;
  private edgeIdxBuf: WebGLBuffer;
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
  private uScenePointSize: WebGLUniformLocation | null;
  private uSceneHasHover: WebGLUniformLocation | null;
  private uLineRes: WebGLUniformLocation | null;
  private uLineScale: WebGLUniformLocation | null;
  private uLineOffset: WebGLUniformLocation | null;
  private uLineDpr: WebGLUniformLocation | null;
  private uLinePointSize: WebGLUniformLocation | null;
  private uLineHasHover: WebGLUniformLocation | null;
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
    this.progSceneLines = link(gl, VERT_SCENE, FRAG_LINES);
    this.progArrows = link(gl, VERT_ARROW, FRAG_ARROW);

    this.posBuf = gl.createBuffer()!;
    this.colorBuf = gl.createBuffer()!;
    this.flagBuf = gl.createBuffer()!;
    this.edgeIdxBuf = gl.createBuffer()!;
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
    this.uScenePointSize = gl.getUniformLocation(this.progScene, "uPointSize");
    this.uSceneHasHover = gl.getUniformLocation(this.progScene, "uHasHover");
    this.uLineRes = gl.getUniformLocation(this.progSceneLines, "uResolution");
    this.uLineScale = gl.getUniformLocation(this.progSceneLines, "uScale");
    this.uLineOffset = gl.getUniformLocation(this.progSceneLines, "uOffset");
    this.uLineDpr = gl.getUniformLocation(this.progSceneLines, "uDpr");
    this.uLinePointSize = gl.getUniformLocation(this.progSceneLines, "uPointSize");
    this.uLineHasHover = gl.getUniformLocation(this.progSceneLines, "uHasHover");
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
    gl.bindVertexArray(null);
    return vao;
  }

  private buildEdgeVao(): WebGLVertexArrayObject {
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
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIdxBuf);
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

  setEdges(edges: Uint32Array, edgeCount: number): void {
    const gl = this.gl;
    this.edgeCount = edgeCount;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIdxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edges, gl.STATIC_DRAW);
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

  render(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0); // transparent — geometry only; app theme shows through
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.nodeCount === 0) return;

    const v = this.view;
    // Nodes (points) + hover highlight.
    gl.useProgram(this.progScene);
    gl.uniform2f(this.uSceneRes, this.cssW, this.cssH);
    gl.uniform1f(this.uSceneScale, v.scale);
    gl.uniform2f(this.uSceneOffset, v.ox, v.oy);
    gl.uniform1f(this.uSceneDpr, this.dpr);
    gl.uniform1f(this.uScenePointSize, NODE_R * 2);
    gl.uniform1f(this.uSceneHasHover, this.hasHover ? 1 : 0);
    gl.bindVertexArray(this.vaoScene);
    gl.drawArrays(gl.POINTS, 0, this.nodeCount);

    // Edges (lines) — same geometry, line fragment shader.
    if (this.edgeCount > 0) {
      gl.useProgram(this.progSceneLines);
      gl.uniform2f(this.uLineRes, this.cssW, this.cssH);
      gl.uniform1f(this.uLineScale, v.scale);
      gl.uniform2f(this.uLineOffset, v.ox, v.oy);
      gl.uniform1f(this.uLineDpr, this.dpr);
      gl.uniform1f(this.uLinePointSize, NODE_R * 2);
      gl.uniform1f(this.uLineHasHover, this.hasHover ? 1 : 0);
      gl.bindVertexArray(this.vaoEdges);
      gl.drawElements(gl.LINES, this.edgeCount * 2, gl.UNSIGNED_INT, 0);
    }

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
    gl.deleteBuffer(this.edgeIdxBuf);
    gl.deleteBuffer(this.arrowBuf);
    gl.deleteVertexArray(this.vaoScene);
    gl.deleteVertexArray(this.vaoEdges);
    gl.deleteVertexArray(this.vaoArrows);
    gl.deleteProgram(this.progScene);
    gl.deleteProgram(this.progSceneLines);
    gl.deleteProgram(this.progArrows);
  }
}
