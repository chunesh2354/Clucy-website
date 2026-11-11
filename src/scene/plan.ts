// The illustrative plan the field condenses into. World units, x east, z south, y up.
// The brand dot (and the figure) sit at the origin, on the threshold of the plan's east opening,
// exactly where the dot sits in the Room symbol. No dimension from this plan is ever shown on the site:
// it is a drawing, not a standards claim.

export type Vec2 = [number, number];

export interface WallSegment {
  a: Vec2;
  b: Vec2;
  /** Drawn thickness of the wall line. */
  t: number;
  kind: "wall" | "glass";
}

export interface Room {
  name: string;
  min: Vec2;
  max: Vec2;
  /** Centre, used for the adjacency graph and the walking routes. */
  c: Vec2;
}

const OUT = 0.55;
const IN = 0.32;
const GLASS = 0.12;

const w = (ax: number, az: number, bx: number, bz: number, t: number, kind: WallSegment["kind"] = "wall"): WallSegment => ({
  a: [ax, az],
  b: [bx, bz],
  t,
  kind,
});

export const WALLS: WallSegment[] = [
  // north facade with two windows
  w(-20, -7, -17, -7, OUT), w(-17, -7, -13.5, -7, GLASS, "glass"), w(-13.5, -7, -7, -7, OUT),
  w(-7, -7, -3.5, -7, GLASS, "glass"), w(-3.5, -7, 0, -7, OUT),
  // south facade with two windows
  w(-20, 7, -16, 7, OUT), w(-16, 7, -12.5, 7, GLASS, "glass"), w(-12.5, 7, -6.5, 7, OUT),
  w(-6.5, 7, -3, 7, GLASS, "glass"), w(-3, 7, 0, 7, OUT),
  // west wall, and the east wall split by the opening (the Room's opening faces east)
  w(-20, -7, -20, 7, OUT), w(0, -7, 0, -1.5, OUT), w(0, 1.5, 0, 7, OUT),
  // corridor walls with door gaps
  w(-20, -1.5, -16, -1.5, IN), w(-14.6, -1.5, -5, -1.5, IN), w(-3.6, -1.5, 0, -1.5, IN),
  w(-20, 1.5, -14, 1.5, IN), w(-12.6, 1.5, -4, 1.5, IN), w(-2.6, 1.5, 0, 1.5, IN),
  // partitions
  w(-10, -7, -10, -1.5, IN), w(-8, 1.5, -8, 7, IN),
];

export const ROOMS: Room[] = [
  { name: "north-west", min: [-20, -7], max: [-10, -1.5], c: [-15, -4.25] },
  { name: "north-east", min: [-10, -7], max: [0, -1.5], c: [-5, -4.25] },
  { name: "south-west", min: [-20, 1.5], max: [-8, 7], c: [-14, 4.25] },
  { name: "south-east", min: [-8, 1.5], max: [0, 7], c: [-4, 4.25] },
];

export const CORRIDOR: Room = { name: "corridor", min: [-20, -1.5], max: [0, 1.5], c: [-10, 0] };

/** Door centres, one per room, in ROOMS order. */
export const DOORS: Vec2[] = [
  [-15.3, -1.5],
  [-4.3, -1.5],
  [-13.3, 1.5],
  [-3.3, 1.5],
];

/** Walking routes for the people: along the corridor from the opening, through a door, to the room centre. */
export const ROUTES: [number, number, number, number][] = DOORS.map((d, i) => [d[0], Math.sign(d[1]) * 2.8, ROOMS[i].c[0], ROOMS[i].c[1]]);

/** Window openings on the south facade, used by the daylight streams: [x0, x1]. */
export const SOUTH_WINDOWS: Vec2[] = [
  [-16, -12.5],
  [-6.5, -3],
];

/** Where the figure stands: on the dot, just inside the threshold. */
export const FIGURE_AT: [number, number, number] = [0.25, 0, 0];

/** Distance along a ray from p in direction d to the nearest wall centreline, or max. */
export function rayToWalls(p: Vec2, d: Vec2, max: number): number {
  let best = max;
  for (const s of WALLS) {
    if (s.kind === "glass") continue;
    const ex = s.b[0] - s.a[0];
    const ez = s.b[1] - s.a[1];
    const den = d[0] * ez - d[1] * ex;
    if (Math.abs(den) < 1e-9) continue;
    const qx = s.a[0] - p[0];
    const qz = s.a[1] - p[1];
    const t = (qx * ez - qz * ex) / den;
    const u = (qx * d[1] - qz * d[0]) / den;
    if (t > 0.05 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}
