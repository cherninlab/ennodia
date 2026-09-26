import { agent, graphAgents, graphTasks, middleRow, route, routeText, type GraphAgentId, type TaskId } from "../data/agents";

// Figure 1's states: the agent you work in, the task, and whether Ennodia is
// there. The server rendered the first state; this keeps the rest in step.
const root = document.querySelector<HTMLElement>("[data-graph]");

if (root) {
  const state = { from: "codex" as GraphAgentId, task: "listen" as TaskId, off: false };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // A link can open a given state, such as /?from=claude&task=review#abilities.
  const params = new URLSearchParams(location.search);
  if (graphAgents.some((entry) => entry.id === params.get("from"))) state.from = params.get("from") as GraphAgentId;
  if (graphTasks.some((entry) => entry.id === params.get("task"))) state.task = params.get("task") as TaskId;
  state.off = params.get("ennodia") === "off";
  const all = <T extends Element>(selector: string) => [...root.querySelectorAll<T>(selector)];
  const one = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const setText = (selector: string, value: string) => {
    for (const element of all<HTMLElement>(selector)) element.textContent = value;
  };

  const render = () => {
    const row = middleRow(state.from);
    const { workers, compare } = route(state.from, state.task);
    const text = routeText(state.from, state.task);
    const task = graphTasks.find((entry) => entry.id === state.task)!;
    const handoff = workers.length > 0 && !state.off;

    // The task's capability strip shows, and a hidden strip pauses. Readers who
    // ask for less motion get its still frame.
    for (const strip of all<HTMLElement>("[data-strip]")) {
      strip.hidden = strip.dataset.strip !== state.task;
      const video = strip.querySelector("video");
      if (!video) continue;
      if (strip.hidden || reduceMotion.matches) video.pause();
      else void video.play().catch(() => undefined);
    }
    for (const button of all<HTMLButtonElement>("[data-from]")) button.setAttribute("aria-pressed", String(button.dataset.from === state.from));
    for (const button of all<HTMLButtonElement>("[data-task]")) button.setAttribute("aria-pressed", String(button.dataset.task === state.task));
    root.classList.toggle("is-off", state.off);
    root.classList.toggle("is-self", workers.length === 0);

    // Your agent sits above and below the row. The other three fill it.
    for (const icon of all<HTMLElement>("[data-icon]")) icon.hidden = icon.dataset.icon !== state.from;
    setText("[data-you-app]", agent(state.from).app);
    setText("[data-you-model]", agent(state.from).model);
    for (const node of all<HTMLElement>("[data-agent]")) {
      const column = row.indexOf(node.dataset.agent as GraphAgentId);
      node.hidden = column < 0;
      node.style.gridColumn = column < 0 ? "" : String(column + 1);
      node.classList.toggle("is-active", workers.includes(node.dataset.agent as GraphAgentId));
    }
    for (const path of all<SVGPathElement>("[data-out], [data-back]")) {
      const column = Number(path.dataset.out ?? path.dataset.back);
      path.classList.toggle("is-active", workers.includes(row[column]!));
    }
    one<HTMLElement>(".graph-you").classList.toggle("is-sending", handoff);
    one<HTMLElement>(".graph-back").classList.toggle("is-receiving", handoff);
    one<HTMLElement>("[data-compare]").hidden = !compare || state.off;
    setText("[data-back-short]", state.off && workers.length ? "You copy it back yourself" : text.backShort);

    setText("[data-summary]", state.off ? text.alone : text.summary);
    setText("[data-request]", task.request);
    one<HTMLElement>("[data-facts]").hidden = !handoff;
    setText("[data-sent]", text.sent);
    setText("[data-runs]", text.runs);
    setText("[data-back]", text.back);

    const evidence = one<HTMLElement>("[data-evidence]");
    const recorded = task.recorded && task.recorded.from === state.from && handoff ? task.recorded : undefined;
    evidence.replaceChildren();
    const note = document.createElement("span");
    if (recorded) {
      const dot = document.createElement("span");
      dot.className = "recorded-dot";
      dot.setAttribute("aria-hidden", "true");
      note.append(dot, recorded.text);
      const link = document.createElement("a");
      link.className = "text-link";
      link.href = recorded.href;
      link.textContent = "Read the write-up";
      evidence.append(note, link);
    } else {
      note.textContent = "Example request. Model access depends on your installed agents and accounts.";
      evidence.append(note);
    }
  };

  for (const button of all<HTMLButtonElement>("[data-from]")) {
    button.addEventListener("click", () => {
      state.from = button.dataset.from as GraphAgentId;
      render();
    });
  }
  for (const button of all<HTMLButtonElement>("[data-task]")) {
    button.addEventListener("click", () => {
      state.task = button.dataset.task as TaskId;
      render();
    });
  }
  const offSwitch = one<HTMLInputElement>("[data-off]");
  offSwitch.addEventListener("change", () => {
    state.off = offSwitch.checked;
    render();
  });

  reduceMotion.addEventListener("change", render);
  offSwitch.checked = state.off;
  render();
}
