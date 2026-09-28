import { agent, graphAgents, graphTasks, middleRow, route, routeText, type GraphAgentId, type TaskId } from "../data/agents";
import { AGENTS, STAGE, backPath, comparePoint, manualSteps, outPath, percent } from "../data/graph-layout";

// Fig. 2's states: the task, the agent you work in, and whether Ennodia is
// there. The server rendered the first state. This keeps the rest in step.
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
  const figure = one<HTMLElement>(".fig");
  const setText = (selector: string, value: string) => {
    for (const element of all<HTMLElement>(selector)) element.textContent = value;
  };
  const x = (value: number) => percent(value, STAGE.width);
  const y = (value: number) => percent(value, STAGE.height);
  const press = (selector: string, key: string, value: string) => {
    for (const button of all<HTMLButtonElement>(selector)) button.setAttribute("aria-pressed", String(button.dataset[key] === value));
  };

  // A strip plays once when it comes into view, then rests on its last
  // frame, so nothing moves beside the text you read. A click replays it.
  // Readers who ask for less motion get the last frame only.
  let seen = false;
  const play = (video: HTMLVideoElement) => {
    if (reduceMotion.matches) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  };
  const shownStrip = () => all<HTMLVideoElement>("[data-strip]").find((video) => !video.hidden);

  const render = (replay: boolean) => {
    const row = middleRow(state.from);
    const { workers, compare } = route(state.from, state.task);
    const text = routeText(state.from, state.task);
    const task = graphTasks.find((entry) => entry.id === state.task)!;
    const you = agent(state.from);
    const rows = workers.map((id) => row.indexOf(id));
    const handoff = workers.length > 0 && !state.off;
    const manual = workers.length > 0 && state.off;

    press("[data-task]", "task", state.task);
    press("[data-from]", "from", state.from);
    press("[data-mode]", "mode", state.off ? "off" : "on");
    figure.classList.toggle("is-self", workers.length === 0);
    figure.classList.toggle("is-off", manual);

    // Your chat: your message, your agent's tool call, and the answer.
    setText("[data-you-app]", you.app);
    setText("[data-you-model]", you.model);
    setText("[data-request]", task.request);
    setText("[data-call-label]", manual ? "You" : "Tool");
    setText("[data-call]", manual
      ? "Switch apps"
      : workers.length === 1 ? `ennodia_run: ${agent(workers[0]!).app}` : workers.length ? `ennodia_run: ${workers.length} agents` : `${you.app}’s own tools`);
    const history = one<HTMLElement>("[data-history]");
    history.hidden = !handoff;
    history.textContent = `Your history stays in ${you.app}`;
    setText("[data-answer-from]", manual ? "You" : you.app);
    setText("[data-answer]", manual ? "Pasted in by hand" : text.backShort);

    // The other three agents fill the rows in a fixed order.
    for (const item of all<HTMLElement>("[data-agent]")) {
      const index = row.indexOf(item.dataset.agent as GraphAgentId);
      item.hidden = index < 0;
      if (index >= 0) item.style.top = `calc(${y(AGENTS.rows[index]!)} - 16px)`;
      item.classList.toggle("is-active", workers.includes(item.dataset.agent as GraphAgentId));
    }

    for (const port of all<SVGCircleElement>("[data-port]")) port.classList.toggle("is-active", rows.includes(Number(port.dataset.port)));

    // The route, drawn in olive through Ennodia or dashed when you carry it.
    one<SVGPathElement>("[data-out]").setAttribute("d", rows.length ? outPath(rows) : "");
    one<SVGPathElement>("[data-back]").setAttribute("d", rows.length ? backPath(rows) : "");
    const join = comparePoint(rows.length ? rows : [0]);
    const joinDot = one<SVGCircleElement>("[data-join]");
    joinDot.setAttribute("cx", String(join.x));
    joinDot.setAttribute("cy", String(join.y));
    joinDot.toggleAttribute("hidden", !(compare && handoff));
    const tag = one<HTMLElement>("[data-compare]");
    tag.hidden = !(compare && handoff);
    tag.style.left = x(join.x);
    tag.style.top = y(join.y);

    one<HTMLElement>("[data-out-label]").hidden = !handoff;
    setText("[data-item]", text.item);
    const backLabel = one<HTMLElement>("[data-back-label]");
    backLabel.hidden = !handoff;
    backLabel.textContent = text.backLabel;

    const steps = one<HTMLElement>("[data-steps]");
    steps.hidden = !manual;
    manualSteps(rows.length ? rows : [0]).forEach((point, index) => {
      const step = one<HTMLElement>(`[data-step="${index}"]`);
      step.style.left = x(point.x);
      step.style.top = y(point.y);
      step.querySelector("[data-step-text]")!.textContent = text.steps[index] ?? "";
    });

    // The task's strip rides the return path.
    for (const video of all<HTMLVideoElement>("[data-strip]")) {
      const shown = video.dataset.strip === state.task;
      video.hidden = !shown;
      if (!shown) video.pause();
    }
    const strip = shownStrip();
    if (strip && replay && seen) play(strip);
    setText("[data-strip-note]", strip?.dataset.note ?? "");

    setText("[data-summary]", manual ? text.alone : text.summary);
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
    const credit = one<HTMLElement>("[data-credit]");
    const source = strip?.dataset.creditHref;
    credit.hidden = !source;
    credit.replaceChildren();
    if (source) {
      const link = document.createElement("a");
      link.href = source;
      link.textContent = strip!.dataset.creditText ?? "";
      credit.append(link);
    }
  };

  for (const button of all<HTMLButtonElement>("[data-task]")) {
    button.addEventListener("click", () => {
      state.task = button.dataset.task as TaskId;
      render(true);
    });
  }
  for (const button of all<HTMLButtonElement>("[data-from]")) {
    button.addEventListener("click", () => {
      state.from = button.dataset.from as GraphAgentId;
      render(true);
    });
  }
  for (const button of all<HTMLButtonElement>("[data-mode]")) {
    button.addEventListener("click", () => {
      state.off = button.dataset.mode === "off";
      render(false);
    });
  }
  for (const video of all<HTMLVideoElement>("[data-strip]")) video.addEventListener("click", () => play(video));

  // The first strip waits until the figure is in view.
  const watcher = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    seen = true;
    watcher.disconnect();
    const strip = shownStrip();
    if (strip) play(strip);
  }, { threshold: 0.4 });
  watcher.observe(one(".fig-stage"));

  render(false);
}
