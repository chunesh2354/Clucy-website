// Tile, the Clucy pet (from the brand kit, approved draft A). Its eye is the brand dot:
// blue when ready, amber while a plan waits for you. It jumps once when a build lands,
// and its eye follows the cursor while it is idle.

export type PetState = "idle" | "waiting" | "built";

export class Pet {
  private eyes: SVGGraphicsElement[];
  private last: PetState = "idle";

  constructor(private els: SVGSVGElement[], private reduced: boolean) {
    this.eyes = els.map((el) => el.querySelector<SVGGraphicsElement>("[data-pet-eye]")!).filter(Boolean);
    if (!reduced) window.addEventListener("pointermove", (e) => this.look(e.clientX, e.clientY), { passive: true });
  }

  set(state: PetState) {
    if (state === this.last) return;
    this.last = state;
    for (const el of this.els) {
      el.classList.toggle("is-waiting", state === "waiting");
      if (state === "built" && !this.reduced) {
        el.classList.remove("is-jumping");
        void el.getBoundingClientRect(); // restart the one-off jump
        el.classList.add("is-jumping");
      }
    }
  }

  private look(x: number, y: number) {
    if (this.last === "waiting") return; // never let the gaze hide the amber moment
    this.eyes.forEach((eye, i) => {
      const r = this.els[i].getBoundingClientRect();
      if (!r.width) return;
      const cx = r.left + r.width * 0.6;
      const cy = r.top + r.height * 0.52;
      const a = Math.atan2(y - cy, x - cx);
      eye.setAttribute("transform", `translate(${(Math.cos(a) * 2.2).toFixed(2)} ${(Math.sin(a) * 2.2).toFixed(2)})`);
    });
  }
}
