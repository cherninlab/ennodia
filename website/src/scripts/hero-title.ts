const title = document.querySelector<HTMLElement>("[data-harness-pairs]");

if (title) {
  const pairs: string[][] = JSON.parse(title.dataset.harnessPairs!);
  const rows = Array.from(title.querySelectorAll<HTMLElement>(".harness-title-row"));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let pairIndex = 0;
  let visible = false;
  let hovered = false;
  let focused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    clearTimeout(timer);
    if (!visible || hovered || focused || document.hidden || reducedMotion.matches) return;
    timer = setTimeout(() => {
      pairIndex = (pairIndex + 1) % pairs.length;
      title!.setAttribute("data-rotating", "");
      rows.forEach((row, index) => {
        row.querySelector("[data-leaving]")?.removeAttribute("data-leaving");
        const previous = row.querySelector("[data-active]");
        previous?.removeAttribute("data-active");
        previous?.setAttribute("data-leaving", "");
        row.querySelector(`[data-harness="${pairs[pairIndex][index]}"]`)?.setAttribute("data-active", "");
      });
      schedule();
    }, 4200);
  }

  new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    schedule();
  }, { threshold: .5 }).observe(title);
  title.addEventListener("pointerenter", () => { hovered = true; schedule(); });
  title.addEventListener("pointerleave", () => { hovered = false; schedule(); });
  title.addEventListener("focus", () => { focused = true; schedule(); });
  title.addEventListener("blur", () => { focused = false; schedule(); });
  document.addEventListener("visibilitychange", schedule);
  reducedMotion.addEventListener("change", () => {
    title.removeAttribute("data-rotating");
    title.querySelectorAll("[data-leaving]").forEach(element => element.removeAttribute("data-leaving"));
    schedule();
  });
}
