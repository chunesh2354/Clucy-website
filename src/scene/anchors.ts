// Anchor points in the scene that page labels attach to. Kept free of three.js so the page can
// place nothing until the scene module has loaded.
import { FIGURE_AT } from "./plan";

export const ANCHORS = {
  facts: [
    [-4.3, 0.6, -1.5],
    [-15, 0.6, -4.2],
    [-10, 0.6, 0],
  ] as [number, number, number][],
  built: [
    [-20, 3.1, -3.5],
    [-4.3, 2.2, -1.5],
    [-5.25, 2.4, -7],
  ] as [number, number, number][],
  tools: [0, 1, 2, 3].map((k) => {
    const a = ((-54 + k * 36) * Math.PI) / 180;
    return [40 * Math.cos(a) + 6, 5, 40 * Math.sin(a)];
  }) as [number, number, number][],
  figure: FIGURE_AT,
};
