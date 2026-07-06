#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDefaultEnnodiaCore, type EnnodiaCore } from "./core";
import { errorMessage } from "./internal";
import { createEnnodiaServer } from "./server";

const SHUTDOWN_DEADLINE_MS = 5_000;
const core = createDefaultEnnodiaCore();

try {
  parseCommand(process.argv.slice(2));
  await runMcp(core);
} catch (error) {
  console.error(errorMessage(error));
  await core.shutdown({ deadlineMs: SHUTDOWN_DEADLINE_MS });
  process.exit(1);
}

type CliCommand = { kind: "mcp" };

async function runMcp(core: EnnodiaCore): Promise<void> {
  const server = createEnnodiaServer(core);
  const transport = new StdioServerTransport();
  let shutdownPromise: Promise<void> | undefined;

  transport.onclose = () => {
    void shutdown("transport closed");
  };

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
  if (args.length === 0) {
    return { kind: "mcp" };
  }

  const [first] = args;
  if (first === "io" || first === "--io") {
    throw new Error(
      "Ennodia IO is the separate package `cherninlab/ennodia-io`.",
    );
  }

  throw new Error(`Unknown Ennodia command: ${first}`);
}
