import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "bun:test";
import { ENNODIA_VERSION } from "./version";

describe("MCP server tool surface", () => {
  it("exposes budget on every process-starting orchestration tool", async () => {
    await withClient(async (client) => {
      const tools = await client.listTools();

      for (const name of [
        "ennodia_start",
        "ennodia_start_compositional",
        "ennodia_run",
        "ennodia_start_compare",
      ]) {
        const tool = tools.tools.find((entry) => entry.name === name);
        expect(tool).toBeDefined();
        expect(inputProperties(tool).budget).toBeDefined();
      }
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
