// Agents on the landing graph, what each does natively, and the four tasks
// the graph can route. Each ability is backed by a public source in
// leaders.ts. Only the audio route has a recorded run; the others are
// example requests, and the page labels them so.

export type AgentId = "antigravity" | "claude" | "cline" | "codex" | "hermes" | "kilo" | "kiro" | "opencode";

export type GraphAgentId = "codex" | "claude" | "opencode" | "antigravity";

export type GraphAgent = {
  id: GraphAgentId;
  app: string;
  model: string;
  /** The one sourced strength that sets this agent apart. Every agent codes,
   * so coding alone is not listed as a strength. */
  strength: string;
};

export const graphAgents: GraphAgent[] = [
  { id: "codex", app: "Codex", model: "GPT-6 Astra", strength: "Draws with GPT Image" },
  { id: "claude", app: "Claude Code", model: "Opus 5.5", strength: "Top coding-agent score" },
  { id: "opencode", app: "OpenCode", model: "Kimi K3", strength: "Top long-document score" },
  { id: "antigravity", app: "Antigravity", model: "Gemini 3.8 Flash", strength: "Hears audio files" },
];

export type TaskId = "listen" | "draw" | "review" | "long";

export type GraphTask = {
  id: TaskId;
  tab: string;
  /** What you would type in your chat. */
  request: string;
  /** Present only when a run was recorded for this route. */
  recorded?: { from: GraphAgentId; text: string; href: string };
};

export const graphTasks: GraphTask[] = [
  {
    id: "listen",
    tab: "Listen",
    request: "Gemini, can you listen to this eight-second audio file and tell me what you hear?",
    recorded: {
      from: "codex",
      text: "Recorded run, September 10, 2026. Gemini 3.8 Flash returned the spoken words in 20.0 seconds.",
      href: "/articles/can-gemini-hear-this-file/",
    },
  },
  { id: "draw", tab: "Draw", request: "Draw four stone textures for level two with GPT Image." },
  { id: "review", tab: "Review", request: "Get two independent reviews of this patch before I merge it." },
  { id: "long", tab: "Read", request: "Have Kimi read all of RFC 9110 and list every rule about conditional requests." },
];

const byId = new Map(graphAgents.map((agent) => [agent.id, agent]));
export const agent = (id: GraphAgentId): GraphAgent => byId.get(id)!;

/** The other three agents, in a fixed order, fill the graph's middle row. */
export const middleRow = (from: GraphAgentId): GraphAgentId[] =>
  graphAgents.map((entry) => entry.id).filter((id) => id !== from);

const specialist: Record<Exclude<TaskId, "review">, GraphAgentId> = {
  listen: "antigravity",
  draw: "codex",
  long: "opencode",
};

// A model reviewing its own work is not an independent check, so a review
// always goes to two other agents, and Compare maps where they differ.
const reviewers: GraphAgentId[] = ["claude", "codex", "opencode"];

export type Route = {
  /** Agents that receive work. Empty when your own agent does the task. */
  workers: GraphAgentId[];
  compare: boolean;
};

export function route(from: GraphAgentId, task: TaskId): Route {
  if (task === "review") {
    return { workers: reviewers.filter((id) => id !== from).slice(0, 2), compare: true };
  }
  const worker = specialist[task];
  return worker === from ? { workers: [], compare: false } : { workers: [worker], compare: false };
}

const what: Record<TaskId, { item: string; back: string; short: string }> = {
  listen: { item: "the file path", back: "What Gemini heard", short: "What Gemini heard" },
  draw: { item: "the brief", back: "The textures and a note on each", short: "The textures" },
  review: { item: "the patch", back: "Both reviews, and a Compare of where they agree and differ", short: "Both reviews, compared" },
  long: { item: "the spec’s path", back: "The rules, each with its line number", short: "The rules, with lines" },
};

export type RouteText = {
  summary: string;
  sent: string;
  runs: string;
  back: string;
  /** The line inside the "back in your chat" node. */
  backShort: string;
  alone: string;
};

/** Every sentence the panel shows for one state. */
export function routeText(from: GraphAgentId, task: TaskId): RouteText {
  const you = agent(from).app;
  const { workers, compare } = route(from, task);
  if (workers.length === 0) {
    const self = `${you} does this itself. No handoff is needed.`;
    return { summary: self, sent: "", runs: "", back: "", backShort: `Done in ${you}`, alone: self };
  }
  const names = workers.map((id) => agent(id).app);
  const list = names.join(" and ");
  return {
    summary: `${you} hands ${what[task].item} to ${list}${compare ? ", then compares the answers" : ""}.`,
    sent: `Your prompt, ${what[task].item}, the chosen model, and a time allowance. Your conversation history stays in ${you}.`,
    runs: `${list} ${workers.length > 1 ? "each start" : "starts"} a fresh session with ${workers.length > 1 ? "their own" : "its own"} tools and account.`,
    back: `${what[task].back}, with status and a receipt saved on your computer.`,
    backShort: what[task].short,
    alone: task === "review"
      ? `Without Ennodia, you paste the patch into two other chats and compare the answers yourself.`
      : `Without Ennodia, you open ${list} yourself, repeat the request, and copy the answer back into ${you}.`,
  };
}
