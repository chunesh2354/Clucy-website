// GLSL for the field. Every point's path for every chapter is computed here, on the graphics card,
// so the processor only updates a handful of uniforms per frame.
//
// Brand rules (brand-rules.json v1.0): no glows, gradients, blur or shadows. Points are hard-edged discs;
// depth comes from size and three fixed opacity steps (1, .65, .35), the steps the Contour rings use.
// Colour switches between the ink and paper palettes with a hard-edged circular wipe that opens from the dot.

const COMMON = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uPhase;
uniform float uDpr;
uniform float uPxPerUnit;
uniform float uSize;
uniform vec2 uRes;
uniform vec2 uWipeC;
uniform float uWipeR;
const float PI = 3.14159265;
float ease(float x) { x = clamp(x, 0.0, 1.0); return 1.0 - pow(1.0 - x, 3.0); }
// a transition that starts at the dot and spreads outward: d is the point's normalised distance from the dot
float stag(float s, float d) { return ease((s - 0.4 * d) / 0.6); }
float onPaper(vec4 clip) {
  vec2 sp = (clip.xy / clip.w * 0.5 + 0.5) * uRes;
  return step(distance(sp, uWipeC), uWipeR);
}
float pointSize(vec4 mv, float k) {
  return clamp(uSize * k * uPxPerUnit / max(-mv.z, 0.1), 1.0 * uDpr, 4.5 * uDpr);
}
`;

export const FIELD_VERT = /* glsl */ `
${COMMON}
in vec3 position;   // plan-state position: wall sample, site lattice, or star
in vec4 aSeed;      // x group (0 wall, 1 people, 2 floor field, 3 star), y phase, z lane (-1..1), w height (0..1)
in vec4 aRoute;     // people: door x, door z (inside the room), room centre x, z
in vec3 aLattice;   // the measured lattice point used in the "points are facts" chapter
in vec2 aMeta;      // x opacity step, y tool stream (0..3)
uniform float uStage;
uniform vec3 uInkWall, uInkPeople, uInkFloor, uInkStar;
uniform vec3 uPaperWall, uPaperPeople, uPaperFloor;
out vec4 vC;

// The Room's wall as a curling wave: a squircle in plan (the app-icon tile's shape) opening east,
// highest at the back, flaring outward as it rises.
vec3 wallField(vec4 s, float ph) {
  float R = 12.0;
  float th0 = 0.52;
  float u = fract(s.y + ph * 0.030);
  float th = mix(th0, 2.0 * PI - th0, u);
  float c = cos(th), sn = sin(th);
  float r = R / pow(pow(abs(c), 4.0) + pow(abs(sn), 4.0), 0.25);
  float crest = 0.5 - 0.5 * cos(th);
  crest = crest * crest * (3.0 - 2.0 * crest);
  float H = mix(1.6, 19.0, crest);
  float k = s.w;
  float rr = r + k * k * H * 0.62;
  return vec3(-R + rr * c, k * H, rr * sn);
}
// The current leaving the dot through the opening, in the Contour's 80 degree fan.
vec3 currentField(vec4 s, float ph) {
  float u = fract(s.y + ph * 0.05);
  float rad = 0.5 + 95.0 * u * u;
  float phi = s.z * 0.698 - 0.55 * u - 0.12 * s.z * u;
  return vec3(rad * cos(phi), -0.05, rad * sin(phi));
}
// A sea of streamlines on the floor, parting around the Room like people around a column.
vec3 floorField(vec4 s, float ph) {
  float u = fract(s.y + ph * 0.012);
  float x = mix(-110.0, 120.0, u);
  float sg = s.z < 0.0 ? -1.0 : 1.0;
  float c = sg * mix(8.0, 140.0, pow(abs(s.z), 1.25));
  float a = 15.0;
  float dx = x + 12.0;
  float z = c + a * a * c / (dx * dx + c * c);
  float d = length(vec2(dx, z));
  return vec3(x, min(-1.6 + 0.00045 * d * d, 40.0), z);
}
// People: from just outside the opening, along the corridor, through a door, to the middle of a room.
vec3 route(vec4 rt, vec4 s, float ph) {
  float u = fract(s.y + ph * 0.06);
  vec2 A = vec2(2.5, 0.0), B = vec2(rt.x, 0.0), C = vec2(rt.x, rt.y), D = vec2(rt.z, rt.w);
  float l1 = distance(A, B), l2 = distance(B, C), l3 = max(distance(C, D), 0.001);
  float d = u * (l1 + l2 + l3);
  vec2 p = d < l1 ? mix(A, B, d / l1) : (d < l1 + l2 ? mix(B, C, (d - l1) / l2) : mix(C, D, (d - l1 - l2) / l3));
  p += vec2(s.w - 0.5, s.z) * 0.38;
  return vec3(p.x, 0.03, p.y);
}
// Four streams leaving the building for the four tools.
vec3 toolStream(vec4 s, float k, float ph) {
  float u = fract(s.y + ph * 0.07);
  float a = radians(-54.0 + k * 36.0);
  vec3 P0 = vec3(0.0, 0.05, 0.0);
  vec3 P1 = vec3(16.0, 0.05, 0.0);
  vec3 P2 = vec3(40.0 * cos(a) + 6.0, 5.0, 40.0 * sin(a));
  vec3 p = mix(mix(P0, P1, u), mix(P1, P2, u), u);
  return p + vec3(0.0, 0.0, s.z * 0.55 * u);
}

void main() {
  int g = int(aSeed.x + 0.5);
  float tone = aMeta.x;
  vec3 F, L, P, B, T;
  vec3 ink, paper;
  float d = clamp(length(position.xz) / 26.0, 0.0, 1.0);
  float k = 1.0;
  if (g == 0) {
    F = wallField(aSeed, uPhase); L = aLattice; P = position; B = vec3(position.x, aSeed.w * 3.1, position.z); T = B;
    ink = uInkWall; paper = uPaperWall;
    k = 1.0 + 0.35 * clamp(uStage - 1.0, 0.0, 1.0);
  } else if (g == 1) {
    F = currentField(aSeed, uPhase); L = aLattice; P = route(aRoute, aSeed, uPhase); B = P; T = toolStream(aSeed, aMeta.y, uPhase);
    ink = uInkPeople; paper = uPaperPeople;
    d = fract(aSeed.y) * 0.6;
  } else if (g == 2) {
    F = floorField(aSeed, uPhase); L = aLattice; P = position; B = P; T = P;
    ink = uInkFloor; paper = uPaperFloor;
  } else {
    F = position; L = position; P = position; B = position; T = position;
    ink = uInkStar; paper = uPaperFloor; tone *= 0.9; k = 0.7;
  }
  vec3 pos = mix(F, L, stag(uStage, d));
  pos = mix(pos, P, stag(uStage - 1.0, d));
  pos = mix(pos, B, stag(uStage - 4.0, d));
  pos = mix(pos, T, stag(uStage - 5.0, d));
  // the close: every point flows back into the dot (stars stay in the sky)
  if (g != 3) pos = mix(pos, vec3(0.0, 0.05, 0.0), stag(uStage - 7.0, 1.0 - d));
  // on the lattice ("points are facts") the dots grow and read at full strength
  float lat = g == 3 ? 0.0 : stag(uStage, d) * (1.0 - stag(uStage - 1.0, d));
  k *= 1.0 + 1.4 * lat;
  tone = mix(tone, 1.0, lat);
  if (g == 2) tone *= mix(1.0, 0.65, clamp(uStage - 1.0, 0.0, 1.0));

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = pointSize(mv, k);
  float pp = onPaper(gl_Position);
  // stars are not drawn on paper
  if (g == 3) tone *= 1.0 - pp;
  vC = vec4(mix(ink, paper, pp), tone);
}
`;

export const POINT_FRAG = /* glsl */ `
precision mediump float;
in vec4 vC;
out vec4 fragColor;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  if (dot(q, q) > 0.25 || vC.a <= 0.001) discard;
  fragColor = vC;
}
`;

// Spatial-intelligence layers over the plan: room fields, the adjacency graph, daylight, the view fan.
export const LAYER_VERT = /* glsl */ `
${COMMON}
in vec3 position;   // start point
in vec3 aEnd;       // end point (daylight streams move from start to end; other layers are still)
in vec3 aMeta;      // x layer (0 rooms, 1 graph, 2 daylight, 3 view), y phase, z opacity step
uniform vec4 uLayers;
uniform vec3 uInkA, uInkB, uPaperA, uPaperB;
out vec4 vC;
void main() {
  int l = int(aMeta.x + 0.5);
  float u = l == 2 ? fract(aMeta.y + uPhase * 0.12) : 0.0;
  vec3 pos = mix(position, aEnd, u);
  float vis = l == 0 ? uLayers.x : l == 1 ? uLayers.y : l == 2 ? uLayers.z : uLayers.w;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = pointSize(mv, l == 1 ? 1.25 : 1.0);
  float pp = onPaper(gl_Position);
  vec3 ink = l == 0 ? uInkA : uInkB;
  vec3 paper = l == 0 ? uPaperA : uPaperB;
  vC = vec4(mix(ink, paper, pp), aMeta.z * vis);
}
`;

// The brand dot: one disc at the threshold, sized in world units.
export const DOT_VERT = /* glsl */ `
${COMMON}
in vec3 position;
uniform float uDot;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uDot * uPxPerUnit / max(-mv.z, 0.1), 5.0 * uDpr, 64.0 * uDpr);
}
`;

export const DOT_FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uDotCol;
out vec4 fragColor;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  if (dot(q, q) > 0.25) discard;
  fragColor = vec4(uDotCol, 1.0);
}
`;

// The paper ground: a hard-edged disc drawn in screen space, centred on the dot.
export const WIPE_VERT = /* glsl */ `
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const WIPE_FRAG = /* glsl */ `
precision highp float;
uniform vec2 uWipeC;
uniform float uWipeR;
uniform vec3 uPaper;
out vec4 fragColor;
void main() {
  if (distance(gl_FragCoord.xy, uWipeC) > uWipeR) discard;
  fragColor = vec4(uPaper, 1.0);
}
`;
