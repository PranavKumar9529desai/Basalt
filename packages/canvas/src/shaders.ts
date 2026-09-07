// GLSL source strings for the canvas viewport renderer.
//
// These are the raw shader sources consumed by the program builder in
// programs.ts.  The names mirror the identifiers in the original monolithic
// renderer (packages/canvas/src/renderer.ts before ADR-038 §3).

// --- Rect program: node and group quads -------------------------------------

// aCorner is a per-vertex offset in [-1,1]^2 (a static 6-vert unit quad).
// aPos/aSize are per-instance world position and size. The quad is built in
// world space, then transformed to clip space like any point. Output is
// premultiplied alpha for correct compositing over the app theme.
export const VERT_RECT = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aPos;
layout(location = 2) in vec2 aSize;
layout(location = 3) in vec3 aColor;
layout(location = 4) in float aAlpha;

uniform vec2 uResolution;
uniform float uScale;
uniform vec2 uOffset;

out vec3 vColor;
out float vAlpha;

void main() {
  vec2 world = aPos + aCorner * aSize * 0.5;
  vec2 screen = world * uScale + uOffset;
  vec2 ndc = screen / uResolution * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);
  vColor = aColor;
  vAlpha = aAlpha;
}`;

export const FRAG_RECT = `#version 300 es
precision highp float;

in vec3 vColor;
in float vAlpha;
out vec4 outColor;

void main() {
  outColor = vec4(vColor * vAlpha, vAlpha);
}`;

// --- Edge program: instanced line quads -------------------------------------

// aCorner is a per-vertex offset in [-1,1]^2. aMid/aDir are per-instance
// midpoint and (unnormalized) direction in world space; the quad's width is
// fixed in device pixels (uEdgeWidth) while its length spans the two
// endpoints. aColor/aAlpha tint the whole edge.
export const VERT_EDGE = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aMid;
layout(location = 2) in vec2 aDir;
layout(location = 3) in vec3 aColor;
layout(location = 4) in float aAlpha;

uniform vec2 uResolution;
uniform float uScale;
uniform vec2 uOffset;
uniform float uDpr;
uniform float uEdgeWidth;

out vec3 vColor;
out float vAlpha;

void main() {
  float halfLen = length(aDir) * 0.5;
  vec2 dir = halfLen > 0.0 ? aDir / (halfLen * 2.0) : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  // Length in world units; thickness in device pixels (converted to world).
  float halfW = uEdgeWidth * 0.5 / (uScale * uDpr);
  vec2 world = aMid + dir * aCorner.x * halfLen + perp * aCorner.y * halfW;
  vec2 screen = world * uScale + uOffset;
  vec2 ndc = screen / uResolution * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);
  vColor = aColor;
  vAlpha = aAlpha;
}`;

export const FRAG_EDGE = `#version 300 es
precision highp float;

in vec3 vColor;
in float vAlpha;
out vec4 outColor;

void main() {
  outColor = vec4(vColor * vAlpha, vAlpha);
}`;

// --- Arrow program: directional arrowheads ----------------------------------

// Arrowheads are a flat list of precomputed (x, y) world-space verts (two
// triangles per edge end, generated on the owning side). Color is a uniform.
export const VERT_ARROW = `#version 300 es
layout(location = 0) in vec2 aPos;

uniform vec2 uResolution;
uniform float uScale;
uniform vec2 uOffset;

void main() {
  vec2 screen = aPos * uScale + uOffset;
  vec2 ndc = screen / uResolution * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

export const FRAG_ARROW = `#version 300 es
precision highp float;

uniform vec4 uColor;
out vec4 outColor;

void main() {
  outColor = vec4(uColor.rgb * uColor.a, uColor.a);
}`;
