const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-audience]"));
const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-workflow]"));
const demo = document.querySelector<HTMLElement>("#in-practice");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let pendingTrace = true;
let demoVisible = false;
let frame = 0;

// Trace the branch and return once; every word remains readable throughout.
function traceHandoff() {
  cancelAnimationFrame(frame);
  for (const panel of panels) panel.querySelector(".workflow-diagram")?.removeAttribute("data-tracing");
  if (!pendingTrace || !demoVisible || document.hidden || reducedMotion.matches) return;
  pendingTrace = false;
  // A painted static frame lets rapid switches restart CSS animations reliably.
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      panels.find(panel => !panel.hidden)?.querySelector(".workflow-diagram")?.setAttribute("data-tracing", "");
    });
  });
}

function selectAudience(id: string, updateHash = true) {
  if (!tabs.some(tab => tab.dataset.audience === id)) return;
  if (updateHash) history.replaceState(null, "", `#tab-${id}`);
  for (const tab of tabs) {
    const selected = tab.dataset.audience === id;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of panels) panel.hidden = panel.dataset.workflow !== id;
  pendingTrace = true;
  traceHandoff();
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => selectAudience(tab.dataset.audience!));
  tab.addEventListener("keydown", event => {
    let target: HTMLButtonElement | undefined;
    if (event.key === "ArrowRight") target = tabs[(index + 1) % tabs.length];
    if (event.key === "ArrowLeft") target = tabs[(index + tabs.length - 1) % tabs.length];
    if (event.key === "Home") target = tabs[0];
    if (event.key === "End") target = tabs[tabs.length - 1];
    if (target) {
      event.preventDefault();
      selectAudience(target.dataset.audience!);
      target.focus();
    }
  });
}

function selectFromHash() {
  const id = location.hash.replace(/^#(?:tab|result)-/, "");
  selectAudience(id, false);
  if (location.hash.startsWith("#result-") && tabs.some(tab => tab.dataset.audience === id)) {
    const result = document.querySelector<HTMLDetailsElement>(`#result-${id}`);
    if (result) {
      result.open = true;
      result.querySelector("summary")?.focus({ preventScroll: true });
      result.scrollIntoView({ block: "start" });
    }
  }
}
selectFromHash();
window.addEventListener("hashchange", selectFromHash);

if (demo) {
  new IntersectionObserver(entries => {
    demoVisible = entries.some(entry => entry.isIntersecting);
    if (demoVisible && pendingTrace) traceHandoff();
  }, { threshold: 0.25 }).observe(demo);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    for (const panel of panels) panel.querySelector(".workflow-diagram")?.removeAttribute("data-tracing");
  } else if (pendingTrace) traceHandoff();
});
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) {
    pendingTrace = false;
    cancelAnimationFrame(frame);
    for (const panel of panels) panel.querySelector(".workflow-diagram")?.removeAttribute("data-tracing");
  }
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-value], [data-copy-target]")) {
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  button.addEventListener("click", async () => {
    const text = button.dataset.copyValue ?? document.getElementById(button.dataset.copyTarget ?? "")?.textContent ?? "";
    const status = button.closest(".install-link, .example-body")?.querySelector<HTMLElement>(".copy-feedback");
    clearTimeout(resetTimer);
    try {
      await navigator.clipboard.writeText(text);
      button.setAttribute("data-copied", "");
      if (status) status.textContent = "Copied. Paste into your agent.";
      resetTimer = setTimeout(() => {
        button.removeAttribute("data-copied");
        if (status) status.textContent = "";
      }, 3000);
    } catch {
      button.removeAttribute("data-copied");
      if (status) status.textContent = "Select the text above and copy it.";
    }
  });
}
