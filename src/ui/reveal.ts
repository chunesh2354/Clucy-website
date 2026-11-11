// The closing logo reveal, to the brand motion spec: the dot, then the walls drawn from the opening
// around and back (480 ms), then the name (720 ms), with the settle easing. Reduced motion shows the end state.

export function mountLogoReveal(el: HTMLElement, reduced: boolean) {
  if (reduced) {
    el.classList.add("is-revealed", "is-instant");
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        el.classList.add("is-revealed");
        io.disconnect();
      }
    },
    { threshold: 0.6 },
  );
  io.observe(el);
}
