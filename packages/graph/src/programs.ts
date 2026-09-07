// WebGL program creation, compilation, and linking for the note-link graph
// renderer. Given a context and shader source pairs, produces linked programs;
// throws with diagnostic detail (info log, GL error, context-lost state) on
// failure. Split out of renderer.ts per ADR-038.

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
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

export function link(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
): WebGLProgram {
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