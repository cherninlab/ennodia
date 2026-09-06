import { workflows } from "../data/workflows";

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-audience]"));
const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-workflow]"));
const promptSelect = document.querySelector<HTMLSelectElement>("#prompt-audience");
const promptText = document.querySelector<HTMLElement>("#starter-prompt");
const copyStatus = document.querySelector<HTMLElement>("#copy-status");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let timer: ReturnType<typeof setTimeout> | undefined;
let playingPanel: HTMLElement | undefined;

function stopPlayback() {
  clearTimeout(timer);
  if (playingPanel) {
    const button = playingPanel.querySelector<HTMLButtonElement>("[data-play]");
    button?.setAttribute("aria-label", "Replay workflow");
    button?.removeAttribute("data-playing");
  }
  playingPanel = undefined;
}

function setStep(panel: HTMLElement, step: number) {
  panel.dataset.step = String(step);
  for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-step-button]")) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.stepButton) === step));
  }
}

function play(panel: HTMLElement) {
  stopPlayback();
  playingPanel = panel;
  const button = panel.querySelector<HTMLButtonElement>("[data-play]");
  button?.setAttribute("aria-label", "Pause workflow");
  button?.setAttribute("data-playing", "true");
  setStep(panel, 0);
  timer = setTimeout(() => {
    setStep(panel, 1);
    timer = setTimeout(() => {
      setStep(panel, 2);
      stopPlayback();
    }, 3200);
  }, 2300);
}

function updatePrompt(id: string) {
  const workflow = workflows.find(item => item.id === id);
  if (!workflow) return;
  if (promptSelect) promptSelect.value = id;
  if (promptText) promptText.textContent = workflow.prompt;
  if (copyStatus) copyStatus.textContent = "";
}

function selectAudience(id: string) {
  stopPlayback();
  history.replaceState(null, "", `#tab-${id}`);
  for (const tab of tabs) {
    const selected = tab.dataset.audience === id;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of panels) {
    panel.hidden = panel.dataset.workflow !== id;
    setStep(panel, 2);
  }
  updatePrompt(id);
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

for (const panel of panels) {
  for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-step-button]")) {
    button.addEventListener("click", () => {
      stopPlayback();
      setStep(panel, Number(button.dataset.stepButton));
    });
  }
  panel.querySelector("[data-play]")?.addEventListener("click", () => {
    if (playingPanel === panel) stopPlayback();
    else play(panel);
  });
}

for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-show-audience]")) {
  link.addEventListener("click", event => {
    event.preventDefault();
    const id = link.dataset.showAudience!;
    selectAudience(id);
    document.querySelector("#in-practice")?.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "start" });
    tabs.find(tab => tab.dataset.audience === id)?.focus({ preventScroll: true });
  });
}

promptSelect?.addEventListener("change", () => updatePrompt(promptSelect.value));
document.querySelector("[data-copy-prompt]")?.addEventListener("click", async () => {
  const text = promptText?.textContent ?? "";
  try {
    await navigator.clipboard.writeText(text);
    if (copyStatus) copyStatus.textContent = "Copied. Paste it into your agent conversation.";
  } catch {
    if (copyStatus) copyStatus.textContent = "Select the prompt above to copy it.";
  }
});

function selectFromHash() {
  const id = location.hash.replace("#tab-", "");
  if (workflows.some(item => item.id === id)) selectAudience(id);
}
selectFromHash();
window.addEventListener("hashchange", selectFromHash);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPlayback();
});
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) {
    stopPlayback();
    for (const panel of panels) setStep(panel, 2);
  }
});
