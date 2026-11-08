import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "bun:test";
import { ENNODIA_VERSION } from "./version";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CORE_TOOL_NAMES, createEnnodiaServer, type EnnodiaServerOptions, type ToolSet } from "./server";
import type { EnnodiaCore } from "./core";
import type { HarnessDiscovery } from "./harnesses";
import { HarnessReadinessError, type HarnessReadiness } from "./readiness";
import { inspectInstallation } from "./installation";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

describe("MCP server tool surface", () => {
  it.each(["recheck", "verify"])("executes only the native setup %s selected for the exact route", async action => {
    const harnesses = ["codex", "claude-code"].map(id => ({ id, name: id, kind: "cli", available: true, runnable: true, capabilities: [], notes: [] } satisfies HarnessDiscovery));
    const checks: unknown[] = [];
    const core = { listHarnesses: async () => harnesses, checkHarnesses: async (input: unknown) => {
      checks.push(input); return { installation: inspectInstallation(), harnesses: [harnesses[1]], actionRequired: [] };
    } } as unknown as EnnodiaCore;
    const server = createEnnodiaServer(core);
    const client = new Client({ name: "native-setup-test", version: "1" }, { capabilities: { elicitation: { form: {} } } });
    const forms: unknown[] = [];
    client.setRequestHandler(ElicitRequestSchema, async request => {
      forms.push(request.params);
      return { action: "accept", content: forms.length === 1 ? { harnessId: "claude-code" } : { action } };
    });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const result = await client.callTool({ name: "ennodia_setup", arguments: { model: "opus", cwd: "/workspace" } });
      expect(result.isError).toBeUndefined();
      expect(forms).toHaveLength(2);
      expect(JSON.stringify(forms)).toContain("uses provider capacity");
      expect(checks).toEqual([{ harnessIds: ["claude-code"], model: "opus", cwd: "/workspace", refresh: true, verify: action === "verify", upgrade: false }]);
      expect(JSON.parse(resultText(result)).setup).toEqual({ presentation: "native", action, harnessId: "claude-code" });
      expect(setupPanel(result)).toContain("Ennodia setup");
    } finally { await client.close(); await server.close(); }
  });

  it.each(["unsupported", "cancel", "decline", "recovery", "invalid"])("never starts maintenance for native setup %s", async action => {
    let checks = 0, forms = 0;
    const harnesses = [{ id: "codex", name: "Codex", kind: "cli", available: true, runnable: true, capabilities: [], notes: [] } satisfies HarnessDiscovery];
    const core = { listHarnesses: async () => harnesses, checkHarnesses: async () => { checks += 1; throw new Error("Unexpected check"); } } as unknown as EnnodiaCore;
    const server = createEnnodiaServer(core);
    const client = new Client({ name: "setup-cancel-test", version: "1" }, { capabilities: action === "unsupported" ? {} : { elicitation: { form: {} } } });
    if (action !== "unsupported") client.setRequestHandler(ElicitRequestSchema, async () => {
      forms += 1;
      if (action === "cancel" || action === "decline") return { action };
      return { action: "accept", content: { action: action === "invalid" ? "untrusted-action" : action } };
    });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const result = await client.callTool({ name: "ennodia_setup", arguments: { harnessIds: ["codex"], model: "exact-model" } });
      expect(checks).toBe(0);
      expect(forms).toBe(action === "unsupported" ? 0 : 1);
      if (action === "invalid") expect(result.isError).toBe(true);
      else {
        expect(JSON.parse(resultText(result)).setup).toEqual({ presentation: action === "unsupported" ? "markdown" : "native", action });
        expect(setupPanel(result)).toContain("Ennodia setup");
        expect(setupPanel(result)).toContain('"model":"exact-model"');
      }
    } finally { await client.close(); await server.close(); }
  });

  it("returns a session setup panel without changing the discovery JSON contract", async () => {
    const route = (id: string, state: HarnessReadiness["state"], model?: string): HarnessDiscovery => ({
      id, name: id, kind: "cli", available: true, runnable: true, capabilities: [], notes: [],
      readiness: { state, model, checkedAt: "2026-11-08T00:00:00Z", message: `Native ${state}`,
        recovery: { command: ["/Applications/Claude's CLI/claude", "auth", "login"], instruction: `Recover ${state} in the native tool.`, recheck: { tool: "ennodia_check_harnesses", harnessIds: [id], model, verify: true } } },
    });
    const harnesses = [route("claude-code", "login-required", "opus"), route("codex", "unverified"), route("expired", "credentials-expired"), route("quota", "quota-exhausted"), route("ready", "ready", "exact-model"), { ...route("cline", "setup-required"), available: false, runnable: false }];
    const installation = { ...inspectInstallation(), status: "limited", limitations: ["History storage is unavailable."] } as const;
    const core = { listHarnesses: async () => harnesses, getInstallation: () => installation,
      checkHarnesses: async () => ({ installation, harnesses, actionRequired: [] }) } as unknown as EnnodiaCore;
    const server = createEnnodiaServer(core);
    const client = new Client({ name: "setup-test", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      expect(client.getInstructions()).toContain("inside the current harness session");
      expect(client.getInstructions()).toContain("Do not stop at a generic healthy/unverified status summary");
      const result = await client.callTool({ name: "ennodia_list_harnesses", arguments: {} });
      expect(JSON.parse(resultText(result))).toEqual(harnesses);
      const panel = setupPanel(result);
      expect(panel).toContain("| claude-code (claude-code / opus) | login-required |");
      expect(panel).toContain("'/Applications/Claude'\\''s CLI/claude' auth login");
      expect(panel).toContain('"harnessIds":["claude-code"],"model":"opus","refresh":true,"verify":true');
      expect(panel).toContain("Choose this route for your task, or verify it now.");
      expect(panel).toContain("CLI unavailable");
      expect(panel).toContain("History storage is unavailable.");
      expect(panel).toContain("installation guide");
      expect(panel).toContain("supported harness guide");
      expect(panel.match(/auth login/g)).toHaveLength(1);
      expect(panel).not.toContain('"harnessIds":["ready"]');
      const checked = await client.callTool({ name: "ennodia_check_harnesses", arguments: { cwd: "/workspace" } });
      expect(JSON.parse(resultText(checked)).harnesses).toEqual(harnesses);
      expect(setupPanel(checked)).toContain('"cwd":"/workspace"');
    } finally { await client.close(); await server.close(); }
  });

  it("includes recovery in blocked preflight responses with no started reviewers", async () => {
    const actionRequired = [{ harnessId: "claude-code", harnessName: "Claude Code", readiness: {
      state: "login-required", checkedAt: "2026-11-08T00:00:00Z", model: "opus", message: "Sign-in required.",
      recovery: { command: ["claude", "auth", "login"], instruction: "Sign in through Claude.", recheck: { tool: "ennodia_check_harnesses", harnessIds: ["claude-code"], model: "opus", verify: true } },
    } }] satisfies ConstructorParameters<typeof HarnessReadinessError>[0];
    const server = createEnnodiaServer({ startRun: async () => { throw new HarnessReadinessError(actionRequired); } } as unknown as EnnodiaCore);
    const client = new Client({ name: "recovery-test", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const result = await client.callTool({ name: "ennodia_run", arguments: { prompt: "Review this code" } });
      expect(result.isError).toBe(true);
      expect(JSON.parse(resultText(result))).toMatchObject({ actionRequired, coverage: { started: 0 } });
      expect(setupPanel(result)).toContain("claude auth login");
      expect(setupPanel(result)).toContain('"model":"opus"');
    } finally { await client.close(); await server.close(); }
  });

  it("loads only the core tools by default", async () => {
    expect(await toolNames()).toEqual([...CORE_TOOL_NAMES].sort());
    await withClient(async (client) => {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([...CORE_TOOL_NAMES].sort());
    }, { tools: null });
  });

  it("loads every tool when the full set is requested", async () => {
    const all = await toolNames({ tools: "all" });
    expect(all).toHaveLength(28);
    expect(all).toEqual(expect.arrayContaining([...CORE_TOOL_NAMES, "ennodia_start_compositional", "ennodia_start_plan_advice"]));
    await withClient(async (client) => {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(all);
    }, { tools: null, args: ["--tools", "all"] });
  });

  it("marks reading tools read-only so clients can skip approval prompts", async () => {
    const server = createEnnodiaServer({} as EnnodiaCore, { tools: "all" });
    const client = new Client({ name: "annotation-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = new Map((await client.listTools()).tools.map((tool) => [tool.name, tool.annotations]));
      for (const name of ["ennodia_get_run", "ennodia_list_harnesses", "ennodia_history", "ennodia_get_task", "ennodia_estimate_budget", "ennodia_plan"]) {
        expect(tools.get(name)).toMatchObject({ readOnlyHint: true, openWorldHint: false });
      }
      for (const name of ["ennodia_run", "ennodia_start", "ennodia_start_compare"]) {
        expect(tools.get(name)).toMatchObject({ readOnlyHint: false, openWorldHint: true });
        expect(tools.get(name)?.destructiveHint).toBeUndefined();
      }
      expect(tools.get("ennodia_cancel_run")).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
      expect(tools.get("ennodia_setup")).toMatchObject({ readOnlyHint: true, openWorldHint: true });
      expect(tools.get("ennodia_check_harnesses")).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects an unknown tool set flag before serving", async () => {
    const child = Bun.spawn(["bun", "run", "src/cli.ts", "--tools", "most"], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    expect(await child.exited).toBe(1);
    expect(await new Response(child.stderr).text()).toContain("Unknown tool set: most. Use core or all.");
  });


  it("routes bounded waits through Core and preserves immediate reads", async () => {
    const calls: unknown[] = [];
    const core = {
      getRun: (id: string) => ({id, status: "executing"}),
      waitForRun: async (...args: unknown[]) => {
        calls.push(args);
        return {id: args[0], status: "succeeded", finalAnswer: "verified worker evidence"};
      },
    } as unknown as EnnodiaCore;
    const server = createEnnodiaServer(core);
    const client = new Client({name: "wait-test", version: "1"});
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const immediate = await client.callTool({name: "ennodia_get_run", arguments: {runId: "run"}});
      expect(JSON.parse(resultText(immediate)).status).toBe("executing");
      expect(calls).toHaveLength(0);
      const waited = await client.callTool({name: "ennodia_get_run", arguments: {runId: "run", waitMs: 30000, includeEvents: false}});
      expect(JSON.parse(resultText(waited)).finalAnswer).toBe("verified worker evidence");
      expect(calls).toEqual([["run", 30000, {includeEvents: false, maxEvents: 100, maxAnswerChars: 80000}]]);
      const longer = await client.callTool({name: "ennodia_get_run", arguments: {runId: "run", waitMs: 300000}});
      expect(JSON.parse(resultText(longer)).finalAnswer).toBe("verified worker evidence");
      expect(calls[1]).toEqual(["run", 300000, {includeEvents: true, maxEvents: 100, maxAnswerChars: 80000}]);
      const invalid = await client.callTool({name: "ennodia_get_run", arguments: {runId: "run", waitMs: 300001}});
      expect(invalid.isError).toBe(true);
      expect(calls).toHaveLength(2);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("compact polling keeps answers and failure evidence without repeated setup metadata", async () => {
    const receipt = { id: "run", status: "failed", taskIds: ["worker"], remainingMs: 0,
      finalAnswer: "partial evidence", finalAnswerChars: 16, error: "deadline interrupted",
      diagnosis: {summary: "worker cutoff"}, events: [], plan: {selected: "codex"},
      budget: {estimate: "repeated setup"}, promptPreview: "request", appliedSkills: [] };
    const core = {getRun: () => receipt} as unknown as EnnodiaCore;
    const server = createEnnodiaServer(core);
    const client = new Client({name: "compact-test", version: "1"});
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    try {
      const full = JSON.parse(resultText(await client.callTool({name: "ennodia_get_run", arguments: {runId: "run"}})));
      expect(full).toEqual(receipt);
      const compact = JSON.parse(resultText(await client.callTool({name: "ennodia_get_run", arguments: {runId: "run", compact: true}})));
      expect(compact.plan).toBeUndefined(); expect(compact.budget).toBeUndefined();
      expect(compact.promptPreview).toBeUndefined(); expect(compact.appliedSkills).toBeUndefined();
      for (const key of ["status", "taskIds", "remainingMs", "finalAnswer", "finalAnswerChars", "error", "diagnosis", "events"]) {
        expect(compact[key]).toEqual(full[key]);
      }
    } finally { await client.close(); await server.close(); }
  });

  it("exposes Pragmatic contracts and rejects empty criteria through MCP", async () => {
    await withClient(async (client) => {
      const listed = await client.listTools();
      for (const name of ["ennodia_run", "ennodia_estimate_budget"]) {
        const properties = inputProperties(listed.tools.find((tool) => tool.name === name));
        expect(properties.pragmatic).toBeDefined();
        expect(properties.model).toBeDefined();
        const result = await client.callTool({ name, arguments: {
          prompt: "test", pragmatic: { recipe: "patch", acceptanceCriteria: " " },
        } });
        expect(result.isError).toBe(true);
        expect(resultText(result)).toContain("acceptanceCriteria");
      }
    });
  });

  it("exposes media preparation guidance before any worker launch", async () => {
    await withClient(async (client) => {
      const tools = await client.listTools();
      for (const name of ["ennodia_run", "ennodia_start"]) {
        const prompt = inputProperties(tools.tools.find((tool) => tool.name === name)).prompt;
        expect(prompt).toMatchObject({ description: expect.stringContaining("inputGuidance") });
      }
      const result = await client.callTool({ name: "ennodia_list_harnesses", arguments: {} });
      const harnesses = JSON.parse(resultText(result)) as Array<{ id: string; inputGuidance?: string[] }>;
      const guidance = harnesses.find((harness) => harness.id === "antigravity")?.inputGuidance;
      expect(guidance?.join(" ")).toContain("view_file");
      expect(guidance?.join(" ")).toContain("eight-second MP3");
      expect(guidance?.join(" ")).toContain("not a universal FLAC/WAV support rule");
    });
  });

  it("exposes budget on every process-starting orchestration tool", async () => {
    await withClient(async (client) => {
      const tools = await client.listTools();

      for (const name of [
        "ennodia_start",
        "ennodia_start_compositional",
        "ennodia_run",
        "ennodia_start_compare",
        "ennodia_start_plan_advice",
        "ennodia_start_advised_plan",
      ]) {
        const tool = tools.tools.find((entry) => entry.name === name);
        expect(tool).toBeDefined();
        expect(inputProperties(tool).budget).toBeDefined();
      }
    });
  });

  it("exposes reasoning effort only on raw and high-level worker tools", async () => {
    await withClient(async (client) => {
      const tools = await client.listTools();
      const startEffort = inputProperties(tools.tools.find((tool) => tool.name === "ennodia_start")).reasoningEffort;
      const runEffort = inputProperties(tools.tools.find((tool) => tool.name === "ennodia_run")).reasoningEffort;

      expect(startEffort).toMatchObject({
        type: "string",
        enum: expect.arrayContaining(["low", "max"]),
      });
      expect(runEffort).toMatchObject({
        type: "string",
        enum: expect.arrayContaining(["low", "max"]),
      });
      expect(inputProperties(tools.tools.find((tool) => tool.name === "ennodia_start_compositional")).reasoningEffort)
        .toBeUndefined();
      expect(inputProperties(tools.tools.find((tool) => tool.name === "ennodia_start_plan_advice")).reasoningEffort)
        .toBeUndefined();
    });
  });

  it("publishes the complete Plan Advisor lifecycle and model allowlist schema", async () => {
    await withClient(async (client) => {
      const tools = await client.listTools();
      const names = new Set(tools.tools.map((tool) => tool.name));

      for (const name of [
        "ennodia_start_plan_advice",
        "ennodia_list_plan_advice",
        "ennodia_get_plan_advice",
        "ennodia_cancel_plan_advice",
        "ennodia_start_advised_plan",
      ]) {
        expect(names.has(name)).toBe(true);
        expect(
          tools.tools.find((tool) => tool.name === name)?.description?.trim()
            .length,
        ).toBeGreaterThan(0);
      }

      const start = tools.tools.find((tool) =>
        tool.name === "ennodia_start_plan_advice"
      );
      const allowedModels = inputProperties(start).allowedModels;
      expect(allowedModels).toMatchObject({
        type: "object",
        additionalProperties: {
          type: "array",
          items: { type: "string" },
        },
      });
    });
  });

  it("rejects unknown forced harness estimates", async () => {
    await withClient(async (client) => {
      const result = await client.callTool({
        name: "ennodia_estimate_budget",
        arguments: {
          prompt: "Review this plan.",
          harnessId: "missing-harness",
        },
      });

      expect(isToolError(result)).toBe(true);
      expect(resultText(result)).toContain("Unknown harness: missing-harness");
    });
  });

  it("rejects unknown compositional slice harness estimates", async () => {
    await withClient(async (client) => {
      const result = await client.callTool({
        name: "ennodia_estimate_compositional_budget",
        arguments: {
          prompt: "Synthesize the slices.",
          slices: [
            {
              id: "missing",
              harnessId: "missing-harness",
              prompt: "Review one focused slice.",
            },
          ],
        },
      });

      expect(isToolError(result)).toBe(true);
      expect(resultText(result)).toContain("Unknown harness: missing-harness");
    });
  });

  it("reports missing compositional task IDs without failing", async () => {
    await withClient(async (client) => {
      const result = await client.callTool({
        name: "ennodia_get_compositional_status",
        arguments: {
          taskIds: ["missing-task"],
          prompt: "Synthesize the completed shards.",
        },
      });
      const parsed = JSON.parse(resultText(result)) as {
        missingTaskIds: string[];
        compareReady: boolean;
        counts: { missing: number; known: number };
      };

      expect(isToolError(result)).toBe(false);
      expect(parsed.missingTaskIds).toEqual(["missing-task"]);
      expect(parsed.compareReady).toBe(false);
      expect(parsed.counts).toMatchObject({ missing: 1, known: 0 });
    });
  });

  it("requires an explicit cwd for project skill installation", async () => {
    await withClient(async (client) => {
      const result = await client.callTool({
        name: "ennodia_install_skills",
        arguments: {
          dryRun: true,
          scope: "project",
          harnessIds: ["codex"],
        },
      });

      expect(isToolError(result)).toBe(true);
      expect(resultText(result)).toContain("Project skill installation requires cwd");
    });
  });

  it("keeps documented tool headings aligned with registered tools", async () => {
    const docs = await Bun.file(
      new URL("../docs/reference/mcp-tools.md", import.meta.url),
    ).text();
    const documented = [...docs.matchAll(/^### `(ennodia_[^`]+)`$/gm)]
      .map((match) => match[1])
      .sort();

    await withClient(async (client) => {
      const tools = await client.listTools();
      expect(documented).toEqual(tools.tools.map((tool) => tool.name).sort());
    });
  });

  it("keeps packaged manifest tool schemas aligned with the live server", async () => {
    const manifest = await Bun.file(
      new URL("../manifest.json", import.meta.url),
    ).json() as {
      tools: Array<{
        name: string;
        description?: string;
        inputSchema: unknown;
      }>;
    };

    await withClient(async (client) => {
      const live = await client.listTools();
      // The bundle serves the default set.
      const project = (tool: {
        name: string;
        description?: string;
        inputSchema: unknown;
      }) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });

      expect(manifest.tools.map(project)).toEqual(live.tools.map(project));
    }, { tools: null });
  });
});

/** Starts the real CLI. Most tests inspect advanced tools, so the full set
 * is the default here. Pass tools: null for the CLI's own default. */
async function withClient<T>(
  fn: (client: Client) => Promise<T>,
  options: { tools?: ToolSet | null; args?: string[] } = {},
): Promise<T> {
  const client = new Client({
    name: "ennodia-server-test",
    version: ENNODIA_VERSION,
  });
  const tools = options.tools === undefined ? "all" : options.tools;
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", "src/cli.ts", ...(options.args ?? [])],
    cwd: process.cwd(),
    stderr: "pipe",
    env: { ...getDefaultEnvironment(), ...(tools ? { ENNODIA_TOOLS: tools } : {}) },
  });

  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function toolNames(options?: EnnodiaServerOptions): Promise<string[]> {
  const server = createEnnodiaServer({} as EnnodiaCore, options);
  const client = new Client({ name: "tool-set-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
    await server.close();
  }
}

function inputProperties(tool: unknown): Record<string, unknown> {
  if (
    typeof tool !== "object" ||
    !tool ||
    !("inputSchema" in tool) ||
    typeof tool.inputSchema !== "object" ||
    !tool.inputSchema ||
    !("properties" in tool.inputSchema) ||
    typeof tool.inputSchema.properties !== "object" ||
    !tool.inputSchema.properties
  ) {
    throw new Error("Tool is missing input schema properties.");
  }

  return tool.inputSchema.properties as Record<string, unknown>;
}

function isToolError(result: unknown): boolean {
  return Boolean(
    typeof result === "object" &&
      result &&
      "isError" in result &&
      result.isError,
  );
}

function setupPanel(result: unknown): string {
  const resource = (result as { content: Array<{ type: string; resource?: { uri: string; mimeType: string; text: string } }> }).content.find(item => item.type === "resource")?.resource;
  expect(resource?.uri).toBe("ennodia://setup");
  expect(resource?.mimeType).toBe("text/markdown");
  return resource!.text;
}

function resultText(result: unknown): string {
  if (
    typeof result !== "object" ||
    !result ||
    !("content" in result) ||
    !Array.isArray(result.content)
  ) {
    return "";
  }

  return result.content
    .filter((item): item is { type: "text"; text: string } =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "text" &&
      "text" in item &&
      typeof item.text === "string"
    )
    .map((item) => item.text)
    .join("\n");
}
