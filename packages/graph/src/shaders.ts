// GLSL source strings for the note-link graph renderer (WebGL2, GLSL ES 300).
//
// Pure data — no logic. Consumed by programs.ts (compilation/linking) and the
// GraphRenderer's per-program setup. Split out of renderer.ts per ADR-038.

export const VERT_SCENE = `#version 300 es
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

export const FRAG_POINTS = `#version 300 es
precision highp float;
in vec3 vColor;
in float vFlag;
uniform float uHasHover;
uniform vec3 uAccent;
uniform vec3 uRing;
out vec4 frag;
void main() {
  // Circular node mask (points are squares by default).
  vec2 d = gl_PointCoord - vec2(0.5);
  if (dot(d, d) > 0.25) discard;
  float r = length(d) * 2.0;
  float a = 1.0;
  vec3 col = vColor;
  if (uHasHover > 0.5) {
    if (vFlag < 0.5) {
      // Unrelated nodes recede hard (Obsidian fades the rest of the vault).
      a = 0.08;
    } else if (vFlag > 1.5) {
      // Hovered node: accent fill + a bright ring hugging the node edge.
      // Point-coord space = ring scales with the node's drawn size.
      bool ring = r > 0.84;
      col = ring ? uRing : uAccent;
    }
  }
  frag = vec4(col * a, a);
}`;

export const VERT_EDGE = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aEndpoints; // ax, ay, bx, by (world space)
layout(location = 2) in float aWeight;
layout(location = 3) in float aEdgeFlag;
uniform vec2 uResolution;
uniform float uScale;
uniform vec2 uOffset;
uniform float uDpr;
uniform float uHasHover;
out float vWeight;
out float vEdgeFlag;
void main() {
  vec2 sA = aEndpoints.xy * uScale + uOffset;
  vec2 sB = aEndpoints.zw * uScale + uOffset;
  vec2 dir = sB - sA;
  float len = length(dir);
  vec2 n = len > 0.0 ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);
  float w = clamp(1.0 + 0.35 * aWeight, 1.0, 2.2) * uDpr;
  if (uHasHover > 0.5 && aEdgeFlag > 0.5) w *= 1.7;
  vec2 base = mix(sA, sB, (aCorner.x + 1.0) * 0.5);
  vec2 screen = base + n * (aCorner.y * w * 0.5);
  vec2 clip = (screen / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  vWeight = aWeight;
  vEdgeFlag = aEdgeFlag;
}`;

export const FRAG_EDGE = `#version 300 es
precision highp float;
in float vWeight;
in float vEdgeFlag;
uniform float uHasHover;
uniform vec3 uEdgeColor;
uniform vec3 uEdgeAccent;
out vec4 frag;
void main() {
  // When a node is hovered, only its connections stay bright; every other
  // edge recedes so the focused node's neighborhood stands out.
  float a = clamp(0.14 + 0.07 * vWeight, 0.14, 0.38);
  vec3 col = uEdgeColor;
  if (uHasHover > 0.5) {
    if (vEdgeFlag > 0.5) {
      a = clamp(0.3 + 0.15 * vWeight, 0.3, 0.6);
      col = mix(uEdgeColor, uEdgeAccent, 0.55);
    } else {
      a = 0.08;
    }
  }
  frag = vec4(col * a, a);
}`;

export const VERT_ARROW = `#version 300 es
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

export const FRAG_ARROW = `#version 300 es
precision mediump float;
uniform vec4 uArrowColor;
out vec4 frag;
void main() {
  frag = vec4(uArrowColor.rgb * uArrowColor.a, uArrowColor.a);
}`;
