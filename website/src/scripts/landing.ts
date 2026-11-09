const wall = document.querySelector<HTMLElement>("[data-exchange-wall]");
const motionButton = wall?.querySelector<HTMLButtonElement>("[data-motion-toggle]");

if (wall && motionButton) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = false;
  let visible = true;

  const updateMotion = () => {
    wall.dataset.animated = String(!reducedMotion.matches);
    wall.dataset.paused = String(paused || !visible || document.hidden);
    motionButton.hidden = reducedMotion.matches;
    motionButton.setAttribute("aria-pressed", String(paused));
    const label = motionButton.querySelector("span");
    if (label) label.textContent = paused ? "Resume motion" : "Pause motion";
  };

  motionButton.addEventListener("click", () => {
    paused = !paused;
    updateMotion();
  });
  reducedMotion.addEventListener("change", updateMotion);
  document.addEventListener("visibilitychange", updateMotion);
  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    updateMotion();
  });
  observer.observe(wall);
  updateMotion();
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-target]")) {
  let timer: ReturnType<typeof setTimeout>;
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copyTarget ?? "");
    const feedback = document.querySelector<HTMLElement>(".copy-feedback");
    clearTimeout(timer);
    try {
      await navigator.clipboard.writeText(target?.textContent?.trim() ?? "");
      button.setAttribute("data-copied", "");
      button.setAttribute("aria-label", "Setup prompt copied");
      if (feedback) feedback.textContent = "Copied. Paste it into the conversation you have open.";
    } catch {
      if (feedback) feedback.textContent = "Select the prompt above to copy it.";
    }
    timer = setTimeout(() => {
      button.removeAttribute("data-copied");
      button.setAttribute("aria-label", "Copy setup prompt");
      if (feedback) feedback.textContent = "";
    }, 4000);
  });
}
