// Brand colours (brand-rules.json v1.0). Grounds are ink and paper only; the dot is ultramarine,
// amber only while the plan waits for the architect's approval ("waiting for you").

export const INK = "#15140F";
export const PAPER = "#F7F4EC";
export const PAPER_ON_INK = "#F5F2EA";
export const ULTRA = "#2B3BD9";
export const ULTRA_ON_INK = "#8592FF";
export const AMBER = "#A35F00";
export const AMBER_ON_INK = "#E3A13A";
export const STONE = "#645F57";

export const ON_INK = {
  wall: PAPER_ON_INK,
  people: ULTRA_ON_INK,
  floor: PAPER_ON_INK,
  star: PAPER_ON_INK,
  dot: ULTRA_ON_INK,
  waiting: AMBER_ON_INK,
};

export const ON_PAPER = {
  wall: INK,
  people: ULTRA,
  floor: STONE,
  dot: ULTRA,
  waiting: AMBER,
};
