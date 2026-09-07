// WebGL shader compilation and program linking for the canvas viewport.
//
// Framework-agnostic helpers extracted from the original monolithic
// packages/canvas/src/renderer.ts (ADR-038 §3).

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("CanvasViewport: failed to create shader");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`CanvasViewport: shader compile failed: ${log}`);
  }
  return shader;
}

export function link(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("CanvasViewport: failed to create program");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`CanvasViewport: program link failed: ${log}`);
  }
  return program;
}
