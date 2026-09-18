import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "bun:test";
import { ENNODIA_VERSION } from "./version";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createEnnodiaServer } from "./server";
import type { EnnodiaCore } from "./core";

describe("MCP server tool surface", () => {
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
    });
  });
});

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    name: "ennodia-server-test",
    version: ENNODIA_VERSION,
  });
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", "src/cli.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });

  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
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
