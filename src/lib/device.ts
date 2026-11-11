// What this visitor's device can do, decided once on load.

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

export interface Tier {
  name: "desktop" | "laptop" | "phone";
  /** Points to build. The page may draw fewer if frames run slow. */
  points: number;
  maxDpr: number;
  pointer: boolean;
}

export function deviceTier(): Tier {
  const coarse = (() => {
    try {
      return window.matchMedia("(pointer: coarse)").matches;
    } catch {
      return false;
    }
  })();
  const narrow = Math.min(window.innerWidth, screen.width) < 760;
  if (coarse || narrow) return { name: "phone", points: 40000, maxDpr: 1.5, pointer: false };
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 4) return { name: "laptop", points: 80000, maxDpr: 1.5, pointer: true };
  return { name: "desktop", points: 150000, maxDpr: 2, pointer: true };
}

/** Steps the point count down when frames run slow: 150k -> 80k -> 40k. */
export class FrameBudget {
  private samples: number[] = [];
  private started = 0;
  constructor(private onStepDown: (next: number) => void, private current: number) {}

  sample(now: number, dt: number) {
    if (!this.started) this.started = now;
    if (now - this.started < 1000) return; // let shaders compile and the page settle first
    this.samples.push(dt);
    if (this.samples.length < 90) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.samples = [];
    if (median > 22 && this.current > 40000) {
      this.current = this.current > 80000 ? 80000 : 40000;
      this.onStepDown(this.current);
    }
  }
}
