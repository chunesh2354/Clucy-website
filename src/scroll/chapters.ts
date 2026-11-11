// The scroll story, in order. Each chapter is one <section data-chapter> in index.html.
// The scene reads a single number, the stage: chapter index plus how far the transition to the next chapter has run.

export interface CameraKey {
  /** Eye position. */
  e: [number, number, number];
  /** Look-at target. */
  c: [number, number, number];
  /** Vertical field of view, degrees. */
  fov: number;
  /** Moves the picture right by this share of the screen width, clear of the text panel (wide screens only). */
  shift: number;
}

export interface Chapter {
  id: string;
  /** Share of the section's scroll that holds still before the transition to the next chapter starts. */
  hold: number;
  /** How fast the points flow while this chapter is on screen (0 = stopped). */
  flow: number;
  cam: CameraKey;
  /** The chapter sits on paper ground (the ink-to-paper wipe opens from the dot). */
  paper: boolean;
  /** The dot shows amber: waiting for the architect. */
  waiting: boolean;
}

export const CHAPTERS: Chapter[] = [
  { id: "field", hold: 0.35, flow: 1, paper: false, waiting: false, cam: { e: [22, 3.6, 25], c: [-9, 4.6, -6], fov: 58, shift: 0.16 } },
  { id: "facts", hold: 0.45, flow: 0.25, paper: false, waiting: false, cam: { e: [-1, 21, 27], c: [-8, 0, 0], fov: 48, shift: 0.18 } },
  { id: "rules", hold: 0.45, flow: 0.55, paper: true, waiting: false, cam: { e: [-9, 33, 15], c: [-9, 0, 0.6], fov: 44, shift: 0.18 } },
  { id: "space", hold: 0.72, flow: 0.55, paper: true, waiting: false, cam: { e: [12, 21, 22], c: [-9, 1.8, 0], fov: 46, shift: 0.18 } },
  { id: "gate", hold: 0.5, flow: 0, paper: false, waiting: true, cam: { e: [9, 5.5, 13], c: [-8, 0.2, -1], fov: 50, shift: 0.2 } },
  { id: "built", hold: 0.45, flow: 0.5, paper: false, waiting: false, cam: { e: [15, 15, 27], c: [-10, 1.8, 0], fov: 44, shift: 0.18 } },
  { id: "tools", hold: 0.45, flow: 0.8, paper: false, waiting: false, cam: { e: [-28, 24, 44], c: [8, 2, 0], fov: 50, shift: 0.14 } },
  { id: "demo", hold: 0.6, flow: 0.3, paper: false, waiting: false, cam: { e: [-40, 38, 62], c: [6, 0, 0], fov: 50, shift: 0 } },
  { id: "close", hold: 1, flow: 1, paper: false, waiting: false, cam: { e: [14, 5, 20], c: [0, 1, 0], fov: 40, shift: 0 } },
];

export const STAGE_MAX = CHAPTERS.length - 1;

/** Settle easing from the brand motion rules, cubic-bezier(.2,.7,.2,1), approximated. */
export function settle(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

export function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export interface ScrollState {
  /** Continuous stage, 0 .. STAGE_MAX. */
  stage: number;
  /** Index of the chapter whose section holds the middle of the screen. */
  index: number;
  /** 0..1 progress through that chapter's hold, for beats inside a chapter. */
  sub: number;
}

/** Reads the chapter sections and works out the stage from the scroll position. */
export function readScroll(sections: HTMLElement[]): ScrollState {
  const mid = window.scrollY + window.innerHeight * 0.5;
  let index = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].offsetTop <= mid) index = i;
  }
  const s = sections[index];
  const ch = CHAPTERS[index];
  const p = Math.min(1, Math.max(0, (mid - s.offsetTop) / Math.max(1, s.offsetHeight)));
  const t = ch.hold >= 1 ? 0 : Math.min(1, Math.max(0, (p - ch.hold) / (1 - ch.hold)));
  return { stage: Math.min(STAGE_MAX, index + t), index, sub: Math.min(1, p / Math.max(0.01, ch.hold)) };
}
