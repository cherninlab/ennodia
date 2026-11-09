import type { ReadinessState } from "./readiness";
import { ENNODIA_VERSION } from "./version";

/** MCP Apps (`io.modelcontextprotocol/ui`, stable 2026-01-26) lets a host show
 * a server's HTML view inside the conversation. Ennodia uses one view: a card
 * of agents and their fixes. Other hosts show the Markdown panel instead.
 * The card calls only `ennodia_check_harnesses` and never collects credentials. */
export const MCP_APPS_EXTENSION = "io.modelcontextprotocol/ui";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export const SETUP_APP_URI = "ui://ennodia/setup.html";

/** The flat key serves hosts that predate the nested `ui.resourceUri` form. */
export const SETUP_APP_TOOL_META = { ui: { resourceUri: SETUP_APP_URI }, "ui/resourceUri": SETUP_APP_URI };

export type AccessKey = ReadinessState | "missing";

/** Plain words for each agent state, shared by the Markdown panel and the card. */
export const ACCESS_TEXT: Record<AccessKey, { label: string; next: string }> = {
  "login-required": { label: "Needs sign-in", next: "Sign in with the command below, then check again." },
  "credentials-expired": { label: "API key expired", next: "Replace the key in the agent's own settings, then check again. Signing in does not renew it." },
  "quota-exhausted": { label: "Out of quota", next: "Restore credits or quota with the provider, then check again. Signing in does not help." },
  "model-unavailable": { label: "Model unavailable", next: "This agent cannot use this model. Pick another from its model list." },
  "setup-required": { label: "Needs setup", next: "Finish the agent's own setup, then check again." },
  unreachable: { label: "Check failed", next: "The check did not finish. Look at the connection or the agent's setup, then check again." },
  updating: { label: "Updating", next: "An update is running. Check again when it finishes." },
  unverified: { label: "Not checked yet", next: "Ennodia checks it on first use." },
  ready: { label: "Ready", next: "" },
  missing: { label: "Not available", next: "Not installed, or it cannot run without a terminal." },
};

/** Agents that need the user come first, unavailable ones last. */
export function accessRank(key: AccessKey): number {
  return key === "unverified" ? 1 : key === "ready" ? 2 : key === "missing" ? 3 : 0;
}

export const HARNESS_GUIDE_URL = "https://ennodia.cherninlab.com/docs/reference/supported-harnesses/";
export const INSTALL_GUIDE_URL = "https://ennodia.cherninlab.com/docs/install/";

/** Plain ES5 so it runs in any host webview without a build step. */
const SETUP_APP_SCRIPT = String.raw`
(function () {
  "use strict";
  var ACCESS = __ACCESS__, RANK = __RANK__;
  var state = { agents: [], installation: null, input: {}, host: {}, busy: {}, notes: {}, newlyReady: {}, error: "", loaded: false };
  var nextId = 1, pending = {}, lastHeight = 0;

  function post(message) { window.parent.postMessage(message, "*"); }
  function request(method, params) {
    var id = nextId++;
    post({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params) { post({ jsonrpc: "2.0", method: method, params: params || {} }); }
  function reply(id, result) { post({ jsonrpc: "2.0", id: id, result: result }); }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.method === undefined) {
      var waiting = pending[m.id];
      if (!waiting) return;
      delete pending[m.id];
      if (m.error) waiting.reject(new Error(m.error.message || "The host rejected the request."));
      else waiting.resolve(m.result);
      return;
    }
    switch (m.method) {
      case "ui/notifications/tool-input": state.input = (m.params && m.params.arguments) || {}; break;
      case "ui/notifications/tool-result": showResult(m.params); break;
      case "ui/notifications/tool-cancelled": state.loaded = true; state.error = "The check was cancelled."; render(); break;
      case "ui/notifications/host-context-changed": applyContext(m.params); break;
      case "ui/resource-teardown": case "ping": if (m.id !== undefined) reply(m.id, {}); break;
      default: if (m.id !== undefined) post({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } });
    }
  });

  function parse(result) {
    var blocks = (result && result.content) || [];
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].type !== "text") continue;
      try { return JSON.parse(blocks[i].text); } catch (error) { return { error: blocks[i].text }; }
    }
    return { error: "Ennodia returned no agent data." };
  }
  function failed(result, data) { return Boolean(result && result.isError || data.error); }

  function normalize(h) {
    var r = h.readiness || {};
    var key = h.runnable === false ? "missing" : (ACCESS[r.state] ? r.state : "unverified");
    return { id: h.id, name: h.name || h.id, model: r.model || "", key: key,
      command: key === "login-required" && r.recovery && Array.isArray(r.recovery.command) ? r.recovery.command : [] };
  }
  function find(id) { for (var i = 0; i < state.agents.length; i++) if (state.agents[i].id === id) return state.agents[i]; return null; }
  function merge(list) {
    (list || []).forEach(function (h) {
      var agent = normalize(h), current = find(agent.id);
      if (current) state.agents[state.agents.indexOf(current)] = agent; else state.agents.push(agent);
    });
  }

  function showResult(result) {
    var data = parse(result);
    state.loaded = true;
    state.error = failed(result, data) ? (data.error || "Ennodia reported an error.") : "";
    if (data.installation) state.installation = data.installation;
    merge(data.harnesses);
    // Sort once: rows keep their place after a check, so nothing moves under the pointer.
    state.agents.sort(function (a, b) { return RANK[a.key] - RANK[b.key]; });
    render();
  }

  function check(agent) {
    var args = { harnessIds: [agent.id], refresh: true, verify: true };
    var model = agent.model || state.input.model;
    if (model) args.model = model;
    if (state.input.cwd) args.cwd = state.input.cwd;
    var before = agent.key;
    state.busy[agent.id] = true;
    state.notes[agent.id] = "Checking…";
    render();
    request("tools/call", { name: "ennodia_check_harnesses", arguments: args }).then(function (result) {
      var data = parse(result);
      if (failed(result, data)) { state.notes[agent.id] = data.error || "The check failed."; return; }
      if (data.installation) state.installation = data.installation;
      merge(data.harnesses);
      var now = find(agent.id);
      state.notes[agent.id] = now && now.key === "ready" ? "Ready now." : now && now.key === before ? "No change yet." : "";
      if (now && now.key === "ready" && before !== "ready") state.newlyReady[agent.id] = true;
    }, function (error) { state.notes[agent.id] = error.message || "The check failed."; })
      .then(function () { delete state.busy[agent.id]; render(); });
  }

  function tellAgent(agent, node) {
    node.disabled = true;
    var text = agent.name + (agent.model ? " (" + agent.model + ")" : "") + " is ready in Ennodia now.";
    request("ui/message", { role: "user", content: [{ type: "text", text: text }] }).then(function () {
      delete state.newlyReady[agent.id]; state.notes[agent.id] = "Sent to the chat."; render();
    }, function () { node.disabled = false; state.notes[agent.id] = "The host did not accept the message."; render(); });
  }

  function openLink(url) {
    if (state.host.openLinks) request("ui/open-link", { url: url }).catch(function () { window.open(url, "_blank", "noopener"); });
    else window.open(url, "_blank", "noopener");
  }

  function shellQuote(args) {
    return args.map(function (arg) { return /^[A-Za-z0-9_.\/:@=+-]+$/.test(arg) ? arg : "'" + arg.replace(/'/g, "'\\''") + "'"; }).join(" ");
  }

  function copy(text, node, code) {
    var reset = function () { setTimeout(function () { node.textContent = "Copy"; }, 1600); };
    var selected = function () {
      var range = document.createRange(); range.selectNodeContents(code);
      var selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      node.textContent = "Selected"; reset();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { node.textContent = "Copied"; reset(); }, selected);
    else selected();
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(label, className, onClick) {
    var node = el("button", className, label);
    node.type = "button";
    node.addEventListener("click", function () { onClick(node); });
    return node;
  }

  function renderAgent(agent) {
    var needsUser = RANK[agent.key] === 0;
    var item = el("li", "agent " + (needsUser ? "action" : agent.key === "missing" ? "unavailable" : agent.key));
    var head = el("div", "head");
    head.appendChild(el("span", "dot"));
    var name = el("span", "name", agent.name);
    if (agent.model) name.appendChild(el("span", "model", agent.model));
    head.appendChild(name);
    head.appendChild(el("span", "status", ACCESS[agent.key].label));
    item.appendChild(head);
    // An unchecked agent needs nothing from the user; its button is enough.
    if (ACCESS[agent.key].next && agent.key !== "unverified") item.appendChild(el("p", "next", ACCESS[agent.key].next));
    if (agent.command.length) {
      var row = el("div", "command");
      var code = el("code", "", shellQuote(agent.command));
      row.appendChild(code);
      row.appendChild(button("Copy", "ghost", function (node) { copy(code.textContent, node, code); }));
      item.appendChild(row);
    }
    if (state.notes[agent.id]) item.appendChild(el("p", "note", state.notes[agent.id]));
    var actions = el("div", "actions");
    if (state.host.serverTools && agent.key !== "ready" && agent.key !== "missing") {
      var checkButton = button(agent.key === "unverified" ? "Verify" : "Check again", needsUser ? "primary" : "", function () { check(agent); });
      checkButton.disabled = Boolean(state.busy[agent.id]);
      actions.appendChild(checkButton);
    }
    if (agent.key === "missing") actions.appendChild(button("Install guide", "", function () { openLink(__GUIDE__); }));
    if (state.newlyReady[agent.id] && state.host.message) actions.appendChild(button("Tell the agent", "primary", function (node) { tellAgent(agent, node); }));
    if (actions.childNodes.length) item.appendChild(actions);
    return item;
  }

  function render() {
    document.getElementById("loading").hidden = state.loaded;
    var list = document.getElementById("agents");
    list.textContent = "";
    state.agents.forEach(function (a) { list.appendChild(renderAgent(a)); });
    if (state.loaded && !state.agents.length && !state.error) list.appendChild(el("li", "agent", "No supported agents were found on this machine."));
    var error = document.getElementById("error");
    error.textContent = state.error; error.hidden = !state.error;
    var install = document.getElementById("install"), report = state.installation;
    install.textContent = "";
    install.hidden = !report || report.status === "healthy";
    if (!install.hidden) {
      install.appendChild(el("p", "", "Ennodia installation: " + report.status + "."));
      var notes = el("ul");
      (report.limitations || []).forEach(function (text) { notes.appendChild(el("li", "", text)); });
      install.appendChild(notes);
      install.appendChild(button("Installation guide", "", function () { openLink(__INSTALL__); }));
    }
    document.getElementById("cost").hidden = !state.host.serverTools || !state.agents.some(function (a) { return a.key !== "ready" && a.key !== "missing"; });
    resize();
  }

  function resize() {
    var height = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (height === lastHeight) return;
    lastHeight = height;
    notify("ui/notifications/size-changed", { height: height });
  }

  function applyContext(context) {
    if (!context) return;
    var root = document.documentElement;
    if (context.theme === "light" || context.theme === "dark") { root.setAttribute("data-theme", context.theme); root.style.colorScheme = context.theme; }
    var variables = context.styles && context.styles.variables;
    if (variables) Object.keys(variables).forEach(function (key) { if (variables[key]) root.style.setProperty(key, variables[key]); });
    var fonts = context.styles && context.styles.css && context.styles.css.fonts;
    if (fonts && !document.getElementById("host-fonts")) { var style = el("style", "", fonts); style.id = "host-fonts"; document.head.appendChild(style); }
  }

  if (window.ResizeObserver) new ResizeObserver(resize).observe(document.documentElement);
  render();
  request("ui/initialize", { appInfo: { name: "ennodia-setup", version: __VERSION__ }, appCapabilities: { availableDisplayModes: ["inline"] }, protocolVersion: "2026-01-26" })
    .then(function (result) {
      state.host = (result && result.hostCapabilities) || {};
      applyContext(result && result.hostContext);
      notify("ui/notifications/initialized", {});
      render();
    }, function () { state.loaded = true; state.error = "This host did not start the Ennodia card."; render(); });
})();
`;

const SETUP_APP_STYLE = `
:root {
  color-scheme: light dark;
  --fb-bg: #ffffff; --fb-soft: #f4f4f2; --fb-text: #1c1b19; --fb-muted: #5f5d58; --fb-border: #e4e2dc;
  --fb-ok: #1f7a3d; --fb-warn: #a65b00; --fb-bad: #b42318;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --fb-bg: #1b1b1a; --fb-soft: #262624; --fb-text: #f2f1ee; --fb-muted: #a9a69f; --fb-border: #3a3936; --fb-ok: #5fd08a; --fb-warn: #f0b04d; --fb-bad: #ff8a7a; }
}
:root[data-theme="dark"] { --fb-bg: #1b1b1a; --fb-soft: #262624; --fb-text: #f2f1ee; --fb-muted: #a9a69f; --fb-border: #3a3936; --fb-ok: #5fd08a; --fb-warn: #f0b04d; --fb-bad: #ff8a7a; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--color-background-primary, var(--fb-bg)); color: var(--color-text-primary, var(--fb-text));
  font: var(--font-text-sm-size, 14px)/var(--font-text-sm-line-height, 1.45) var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
}
main { padding: 14px 16px 12px; }
h1 { font-size: var(--font-heading-xs-size, 15px); font-weight: var(--font-weight-semibold, 600); margin: 0; }
ul { list-style: none; margin: 0; padding: 0; }
#agents { margin-top: 10px; border-top: 1px solid var(--color-border-primary, var(--fb-border)); }
.agent { padding: 10px 0; border-bottom: 1px solid var(--color-border-primary, var(--fb-border)); }
.head { display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--color-text-tertiary, var(--fb-muted)); }
.ready .dot { background: var(--color-text-success, var(--fb-ok)); }
.action .dot { background: var(--color-text-warning, var(--fb-warn)); }
.unavailable .dot { background: transparent; border: 1px solid var(--color-text-tertiary, var(--fb-muted)); }
.name { font-weight: var(--font-weight-medium, 500); min-width: 0; overflow-wrap: anywhere; }
.model { margin-left: 6px; font-weight: var(--font-weight-normal, 400); color: var(--color-text-secondary, var(--fb-muted)); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 0.92em; }
.status { margin-left: auto; white-space: nowrap; color: var(--color-text-secondary, var(--fb-muted)); }
.ready .status { color: var(--color-text-success, var(--fb-ok)); }
.action .status { color: var(--color-text-warning, var(--fb-warn)); }
.next, .note { margin: 4px 0 0 16px; color: var(--color-text-secondary, var(--fb-muted)); }
.note { color: var(--color-text-primary, var(--fb-text)); }
.command { display: flex; align-items: center; gap: 8px; margin: 8px 0 0 16px; padding: 6px 6px 6px 10px; border-radius: var(--border-radius-md, 8px); background: var(--color-background-secondary, var(--fb-soft)); }
.command code { flex: 1 1 auto; min-width: 0; overflow-x: auto; white-space: nowrap; font: 0.92em/1.4 var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 8px 0 0 16px; }
button {
  font: inherit; color: inherit; cursor: pointer; padding: 4px 10px; border-radius: var(--border-radius-sm, 6px);
  border: 1px solid var(--color-border-primary, var(--fb-border)); background: var(--color-background-primary, var(--fb-bg));
}
button:hover { background: var(--color-background-secondary, var(--fb-soft)); }
button:focus-visible { outline: 2px solid var(--color-ring-primary, var(--fb-text)); outline-offset: 1px; }
button:disabled { cursor: default; opacity: 0.55; }
button.primary { background: var(--color-background-inverse, var(--fb-text)); color: var(--color-text-inverse, var(--fb-bg)); border-color: transparent; }
button.ghost { border-color: transparent; background: transparent; padding: 2px 8px; }
#install { margin-top: 10px; padding: 8px 10px; border-radius: var(--border-radius-md, 8px); background: var(--color-background-secondary, var(--fb-soft)); }
#install p { margin: 0 0 4px; font-weight: var(--font-weight-medium, 500); }
#install ul { margin: 0 0 8px 16px; list-style: disc; color: var(--color-text-secondary, var(--fb-muted)); }
#loading, .cost { margin: 10px 0 0; color: var(--color-text-secondary, var(--fb-muted)); }
.cost { font-size: 0.92em; }
.error { margin: 10px 0 0; color: var(--color-text-danger, var(--fb-bad)); }
`;

const ACCESS_KEYS = Object.keys(ACCESS_TEXT) as AccessKey[];

export const SETUP_APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ennodia agents</title>
<style>${SETUP_APP_STYLE}</style>
</head>
<body>
<main>
<h1>Ennodia agents</h1>
<p id="loading">Checking agents…</p>
<p id="error" class="error" role="alert" hidden></p>
<ul id="agents" aria-live="polite"></ul>
<section id="install" hidden></section>
<p id="cost" class="cost" hidden>A check sends at most one small model request.</p>
</main>
<script>${SETUP_APP_SCRIPT
  .replace("__ACCESS__", () => JSON.stringify(ACCESS_TEXT))
  .replace("__RANK__", () => JSON.stringify(Object.fromEntries(ACCESS_KEYS.map(key => [key, accessRank(key)]))))
  .replace("__GUIDE__", () => JSON.stringify(HARNESS_GUIDE_URL))
  .replace("__INSTALL__", () => JSON.stringify(INSTALL_GUIDE_URL))
  .replace("__VERSION__", () => JSON.stringify(ENNODIA_VERSION))}</script>
</body>
</html>
`;
