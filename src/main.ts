// Entry point: fonts and styles, then the scroll-driven scene and the small page behaviours.
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/chapters.css";

import { CHAPTERS, readScroll, smooth } from "./scroll/chapters";
import { FrameBudget, deviceTier, hasWebGL2, prefersReducedMotion } from "./lib/device";
import { mountDemoVideo } from "./ui/video";
import { Pet } from "./ui/pet";
import { mountLogoReveal } from "./ui/reveal";
import { ANCHORS } from "./scene/anchors";

const reduced = prefersReducedMotion();
const root = document.documentElement;
root.classList.toggle("reduced-motion", reduced);

const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]"));
const railButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-rail]"));
const beats = Array.from(document.querySelectorAll<HTMLElement>("[data-beat]"));
const labels = Array.from(document.querySelectorAll<HTMLElement>("[data-anchor]"));
const figure = document.querySelector<SVGSVGElement>("[data-figure]");
const pet = new Pet(Array.from(document.querySelectorAll<SVGSVGElement>("[data-pet]")), reduced);

// ---- page behaviours that work with or without WebGL ----
const demo = document.querySelector<HTMLElement>("[data-video-id]");
if (demo) mountDemoVideo(demo);
const logo = document.querySelector<HTMLElement>("[data-logo-reveal]");
if (logo) mountLogoReveal(logo, reduced);

const scrollToChapter = (id: string) => {
  const s = sections.find((el) => el.dataset.chapter === id);
  if (s) window.scrollTo({ top: s.offsetTop + 2, behavior: reduced ? "auto" : "smooth" });
};
railButtons.forEach((b) => b.addEventListener("click", () => scrollToChapter(b.dataset.rail!)));
document.querySelectorAll<HTMLElement>("[data-goto]").forEach((b) => b.addEventListener("click", () => scrollToChapter(b.dataset.goto!)));

// Early access: a placeholder until hosting and a form service are chosen.
document.querySelectorAll<HTMLButtonElement>("[data-access]").forEach((b) =>
  b.addEventListener("click", () => {
    const note = document.getElementById(b.getAttribute("aria-controls") || "");
    if (note) note.hidden = false;
    b.setAttribute("aria-expanded", "true");
  }),
);

// ---- the scene ----
async function start() {
  if (!hasWebGL2()) {
    root.classList.add("no-webgl");
    return run(null);
  }
  const tier = deviceTier();
  const { FieldScene } = await import("./scene/scene");
  const canvas = document.querySelector<HTMLCanvasElement>("[data-field]")!;
  let scene: InstanceType<typeof FieldScene> | null = null;
  try {
    scene = new FieldScene(canvas, tier.points, tier.maxDpr);
  } catch (err) {
    console.warn("Clucy field could not start; showing the still version.", err);
    root.classList.add("no-webgl");
    return run(null);
  }
  root.classList.add("has-webgl");
  return run(scene, tier.pointer, tier.points);
}

type Scene = import("./scene/scene").FieldScene;

function run(scene: Scene | null, pointer = false, points = 0) {
  let stage = readScroll(sections).stage;
  let phase = 6.2;
  let flow = 1;
  let px = 0, py = 0, tpx = 0, tpy = 0;
  const layers: [number, number, number, number] = [0, 0, 0, 0];
  let last = performance.now();
  let lastIndex = -1;
  let running = true;

  const size = () => scene?.resize(window.innerWidth, window.innerHeight);
  size();
  window.addEventListener("resize", size);
  document.addEventListener("visibilitychange", () => {
    running = document.visibilityState === "visible";
    last = performance.now();
  });
  if (pointer && !reduced) {
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      tpx = (e.clientX / window.innerWidth - 0.5) * 2;
      tpy = -(e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }
  const budget = scene ? new FrameBudget((n) => scene.setCount(n), points) : null;

  const tick = (now: number) => {
    requestAnimationFrame(tick);
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    budget?.sample(now, dt * 1000);

    const s = readScroll(sections);
    // reduced motion: each chapter shows its end state, no transitions in between
    const target = reduced ? s.index : s.stage;
    stage = reduced ? target : stage + (target - stage) * Math.min(1, dt * 4);

    if (s.index !== lastIndex) {
      lastIndex = s.index;
      root.dataset.current = CHAPTERS[s.index].id;
      railButtons.forEach((b, i) => b.setAttribute("aria-current", i === s.index ? "step" : "false"));
    }

    // beats inside "space": rooms, adjacency, circulation, daylight and view
    const inSpace = s.index === 3;
    const beat = inSpace ? (s.sub < 0.28 ? 0 : s.sub < 0.52 ? 1 : s.sub < 0.76 ? 2 : 3) : -1;
    beats.forEach((b, i) => b.setAttribute("aria-current", i === beat ? "true" : "false"));
    const want: [number, number, number, number] = inSpace
      ? [beat >= 0 ? 1 : 0, beat >= 1 ? 1 : 0, beat >= 3 ? 1 : 0, beat >= 3 ? 1 : 0]
      : [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) layers[k] = reduced ? want[k] : layers[k] + (want[k] - layers[k]) * Math.min(1, dt * 4.2);

    const waiting = Math.abs(stage - 4) < 0.5;
    pet.set(waiting ? "waiting" : stage >= 4.6 && stage < 6 ? "built" : "idle");

    if (!scene) return;
    const i = Math.min(CHAPTERS.length - 2, Math.floor(stage));
    const wantFlow = CHAPTERS[i].flow + (CHAPTERS[i + 1].flow - CHAPTERS[i].flow) * smooth(stage - i);
    flow += (wantFlow - flow) * Math.min(1, dt * 4);
    if (!reduced) phase += dt * flow;
    px += (tpx - px) * Math.min(1, dt * 2);
    py += (tpy - py) * Math.min(1, dt * 2);

    scene.frame({ stage, phase, layers, px, py, waiting });
    placeOverlays(scene, stage);
  };
  requestAnimationFrame(tick);

  // Development aid: with ?debug in the address, window.clucyDebug.show(stage, layers) draws a chapter at once.
  if (scene && new URLSearchParams(location.search).has("debug")) {
    (window as unknown as Record<string, unknown>).clucyDebug = {
      show(at: number, l: [number, number, number, number] = [0, 0, 0, 0]) {
        running = false;
        stage = at;
        scene.frame({ stage: at, phase: 6.2, layers: l, px: 0, py: 0, waiting: Math.abs(at - 4) < 0.5 });
        placeOverlays(scene, at);
        return scene.renderer.domElement.toDataURL("image/jpeg", 0.8).length;
      },
      resume() {
        running = true;
      },
    };
  }
}

/** Keeps the figure and the labels pinned to their points in the 3D scene. */
function placeOverlays(scene: Scene, stage: number) {
  if (figure) {
    const foot = scene.toScreen(ANCHORS.figure);
    const head = scene.toScreen([ANCHORS.figure[0], 1.8, ANCHORS.figure[2]]);
    const h = Math.max(5, Math.min(140, foot.y - head.y));
    const fade = 1 - smooth((stage - 7) / 0.6);
    figure.style.transform = `translate(${(foot.x - h / 6).toFixed(1)}px, ${(foot.y - h).toFixed(1)}px)`;
    figure.style.width = `${(h / 3).toFixed(1)}px`;
    figure.style.height = `${h.toFixed(1)}px`;
    figure.style.opacity = foot.visible ? String(fade) : "0";
  }
  for (const el of labels) {
    const [group, k] = el.dataset.anchor!.split(":");
    const at = (ANCHORS as unknown as Record<string, number[][]>)[group]?.[Number(k)];
    const chapter = CHAPTERS.findIndex((c) => c.id === group);
    if (!at || chapter < 0) continue;
    const near = Math.abs(stage - chapter) < 0.18;
    const p = scene.toScreen(at);
    el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    el.classList.toggle("is-on", near && p.visible);
  }
}

start();
