#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDefaultEnnodiaCore, type EnnodiaCore } from "./core";
import { errorMessage } from "./internal";
import { createEnnodiaServer, TOOL_SETS, type ToolSet } from "./server";

const SHUTDOWN_DEADLINE_MS = 5_000;
const core = createDefaultEnnodiaCore();

try {
  const command = parseCommand(process.argv.slice(2));
  await runMcp(core, command.tools);
} catch (error) {
  console.error(errorMessage(error));
  await core.shutdown({ deadlineMs: SHUTDOWN_DEADLINE_MS });
  process.exit(1);
}

type CliCommand = { kind: "mcp"; tools: ToolSet };

async function runMcp(core: EnnodiaCore, tools: ToolSet): Promise<void> {
  const server = createEnnodiaServer(core, { tools });
  const transport = new StdioServerTransport();
  let shutdownPromise: Promise<void> | undefined;

  transport.onclose = () => {
    void shutdown("transport closed");
  };

  process.stdin.once("end", () => { void shutdown("stdin ended", 0); });
  process.stdin.once("close", () => { void shutdown("stdin closed", 0); });

  process.once("SIGINT", () => {
    void shutdown("SIGINT", 130);
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM", 143);
  });

  try {
    await server.connect(transport);
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    await core.shutdown({ deadlineMs: SHUTDOWN_DEADLINE_MS });
    process.exit(1);
  }

  async function shutdown(reason: string, exitCode?: number): Promise<void> {
    shutdownPromise ??= Promise.resolve().then(() =>
      closeAndShutdown(reason)
    );

    await shutdownPromise;

    if (exitCode !== undefined) {
      process.exit(exitCode);
    }
  }

  async function closeAndShutdown(reason: string): Promise<void> {
    try {
      await server.close();
    } catch (error) {
      console.error(
        `Failed to close MCP server after ${reason}: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await core.shutdown({ deadlineMs: SHUTDOWN_DEADLINE_MS });
  }
}

function parseCommand(args: string[]): CliCommand {
  // A flag wins over the environment, which suits MCP client configs.
  let tools = toolSetFromEnv(process.env.ENNODIA_TOOLS);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "io" || arg === "--io") {
      throw new Error(
        "Ennodia IO is the separate package `@cherninlab/ennodia-io`.",
      );
    }
    if (arg !== "--tools" && !arg.startsWith("--tools=")) throw new Error(`Unknown Ennodia command: ${arg}`);
    const value = arg === "--tools" ? args[++index] ?? "" : arg.slice("--tools=".length);
    if (!isToolSet(value)) throw new Error(`Unknown tool set: ${value}. Use ${TOOL_SETS.join(" or ")}.`);
    tools = value;
  }
  return { kind: "mcp", tools };
}

/** An unset or unsubstituted value, such as an MCP bundle placeholder, keeps
 * the core set instead of stopping the server. */
function toolSetFromEnv(value: string | undefined): ToolSet {
  if (!value?.trim()) return "core";
  if (isToolSet(value.trim())) return value.trim() as ToolSet;
  console.error(`Ignoring ENNODIA_TOOLS=${value}: use ${TOOL_SETS.join(" or ")}. Loading the core tools.`);
  return "core";
}

function isToolSet(value: string): value is ToolSet {
  return (TOOL_SETS as readonly string[]).includes(value);
}
