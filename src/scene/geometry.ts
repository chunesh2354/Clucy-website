// Builds the point data once, on load. Same seed, same field, every visit.
import * as THREE from "three";
import { CORRIDOR, DOORS, FIGURE_AT, ROOMS, ROUTES, SOUTH_WINDOWS, WALLS, rayToWalls, type Vec2 } from "./plan";

/** Small deterministic random generator (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20261111;

/** Share of the points in each group. Groups are mixed through the buffer, so drawing fewer points keeps the mix. */
const SHARE = { wall: 0.36, people: 0.2, floor: 0.41 };

const toneOf = (q: number, a: number, b: number) => (q < a ? 1 : q < b ? 0.65 : 0.35);

export function buildField(count: number): THREE.BufferGeometry {
  const r = rng(SEED);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  const route = new Float32Array(count * 4);
  const lattice = new Float32Array(count * 3);
  const meta = new Float32Array(count * 2);

  const lens = WALLS.map((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) * (s.kind === "glass" ? 0.35 : s.t > 0.4 ? 1.25 : 1));
  const total = lens.reduce((a, b) => a + b, 0);
  const site: Vec2[] = [];
  for (let x = -56; x <= 36; x += 2) for (let z = -40; z <= 40; z += 2) if (!(x > -21 && x < 1 && z > -8 && z < 8)) site.push([x, z]);
  const grid: Vec2[] = [];
  for (let x = -28; x <= 8; x += 1) for (let z = -12; z <= 12; z += 1) grid.push([x, z]);
  // points ride on discrete streamlines so the field reads as lines of dots, not as dust
  const lane = (n: number) => Math.floor(r() * n) / (n - 1);

  for (let i = 0; i < count; i++) {
    const pick = r();
    const g = pick < SHARE.wall ? 0 : pick < SHARE.wall + SHARE.people ? 1 : pick < SHARE.wall + SHARE.people + SHARE.floor ? 2 : 3;
    seed[i * 4] = g;
    seed[i * 4 + 1] = r();
    const L = grid[Math.floor(r() * grid.length)];
    lattice.set([L[0], 0, L[1]], i * 3);
    meta[i * 2 + 1] = Math.floor(r() * 4);
    if (g === 0) {
      seed[i * 4 + 2] = 0;
      seed[i * 4 + 3] = Math.floor(Math.pow(r(), 1.1) * 52) / 51;
      let p = r() * total;
      let k = 0;
      while (p > lens[k] && k < lens.length - 1) p -= lens[k++];
      const s = WALLS[k];
      const t = r();
      const dx = s.b[0] - s.a[0];
      const dz = s.b[1] - s.a[1];
      const len = Math.hypot(dx, dz);
      const off = (r() - 0.5) * s.t;
      pos.set([s.a[0] + dx * t + (-dz / len) * off, 0, s.a[1] + dz * t + (dx / len) * off], i * 3);
      meta[i * 2] = s.kind === "glass" ? 0.65 : toneOf(r(), 0.55, 0.85);
    } else if (g === 1) {
      seed[i * 4 + 2] = lane(44) * 2 - 1;
      seed[i * 4 + 3] = r();
      route.set(ROUTES[i % ROUTES.length], i * 4);
      meta[i * 2] = r() < 0.6 ? 1 : 0.65;
    } else if (g === 2) {
      seed[i * 4 + 2] = lane(110) * 2 - 1;
      seed[i * 4 + 3] = 0;
      const S = site[Math.floor(r() * site.length)];
      pos.set([S[0], -0.05, S[1]], i * 3);
      meta[i * 2] = r() < 0.5 ? 0.65 : 0.35;
    } else {
      seed[i * 4 + 2] = r() * 2 - 1;
      seed[i * 4 + 3] = r();
      const th = r() * Math.PI * 2;
      const ph = Math.acos(0.08 + 0.87 * r());
      const R = 380;
      pos.set([R * Math.sin(ph) * Math.cos(th) - 60, R * Math.cos(ph), R * Math.sin(ph) * Math.sin(th)], i * 3);
      meta[i * 2] = toneOf(r(), 0.07, 0.3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  geo.setAttribute("aRoute", new THREE.BufferAttribute(route, 4));
  geo.setAttribute("aLattice", new THREE.BufferAttribute(lattice, 3));
  geo.setAttribute("aMeta", new THREE.BufferAttribute(meta, 2));
  return geo;
}

/** Layer ids used by LAYER_VERT. */
export const LAYER = { rooms: 0, graph: 1, daylight: 2, view: 3 } as const;

const GRAPH_Y = 4.6;

export function buildLayers(): THREE.BufferGeometry {
  const r = rng(SEED + 7);
  const start: number[] = [];
  const end: number[] = [];
  const meta: number[] = [];
  const still = (layer: number, x: number, y: number, z: number, tone: number) => {
    start.push(x, y, z);
    end.push(x, y, z);
    meta.push(layer, 0, tone);
  };
  const line = (layer: number, a: number[], b: number[], step: number, tone: number) => {
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      still(layer, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, tone);
    }
  };

  // Rooms: each room fills as an even field of points.
  for (const room of [...ROOMS, CORRIDOR]) {
    for (let x = room.min[0] + 0.5; x < room.max[0] - 0.3; x += 0.5)
      for (let z = room.min[1] + 0.5; z < room.max[1] - 0.3; z += 0.5) still(LAYER.rooms, x, 0.02, z, room === CORRIDOR ? 0.35 : 0.65);
  }

  // Adjacency graph, lifted above the plan: a node over each room, edges through the doors, stems to the floor.
  const hub = [CORRIDOR.c[0], GRAPH_Y, CORRIDOR.c[1]];
  const node = (c: number[]) => {
    for (let k = 0; k < 90; k++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * 0.55;
      still(LAYER.graph, c[0] + Math.cos(a) * rad, c[1], c[2] + Math.sin(a) * rad, 1);
    }
    line(LAYER.graph, [c[0], 0.05, c[2]], c, 0.35, 0.35);
  };
  node(hub);
  const outside = [4, GRAPH_Y, 0];
  node(outside);
  line(LAYER.graph, outside, hub, 0.12, 1);
  ROOMS.forEach((room, i) => {
    const c = [room.c[0], GRAPH_Y, room.c[1]];
    node(c);
    const door = [DOORS[i][0], GRAPH_Y, DOORS[i][1]];
    const spine = [DOORS[i][0], GRAPH_Y, 0];
    line(LAYER.graph, hub, spine, 0.12, 1);
    line(LAYER.graph, spine, door, 0.12, 1);
    line(LAYER.graph, door, c, 0.12, 1);
  });

  // Daylight: parallel streams falling through the south windows onto the floor.
  const dir = new THREE.Vector3(-0.32, -0.55, -1).normalize();
  for (const [x0, x1] of SOUTH_WINDOWS) {
    for (let k = 0; k < 1500; k++) {
      const wx = x0 + 0.15 + r() * (x1 - x0 - 0.3);
      const wy = 0.9 + r() * 1.3;
      const W = new THREE.Vector3(wx, wy, 7);
      const S = W.clone().addScaledVector(dir, -7);
      const E = W.clone().addScaledVector(dir, wy / -dir.y);
      start.push(S.x, S.y, S.z);
      end.push(E.x, E.y, E.z);
      meta.push(LAYER.daylight, r(), r() < 0.3 ? 0.65 : 0.35);
    }
  }

  // The view fan: what the figure on the threshold can see, measured against the walls.
  const eye: Vec2 = [FIGURE_AT[0], FIGURE_AT[2]];
  const rays = 220;
  for (let k = 0; k < rays; k++) {
    const a = Math.PI + (k / (rays - 1) - 0.5) * (Math.PI * 0.9);
    const d: Vec2 = [Math.cos(a), Math.sin(a)];
    const hit = rayToWalls(eye, d, 30);
    for (let t = 0.6; t < hit; t += 0.45) still(LAYER.view, eye[0] + d[0] * t, 0.04, eye[1] + d[1] * t, t > hit - 0.5 ? 1 : 0.35);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(start, 3));
  geo.setAttribute("aEnd", new THREE.Float32BufferAttribute(end, 3));
  geo.setAttribute("aMeta", new THREE.Float32BufferAttribute(meta, 3));
  return geo;
}
