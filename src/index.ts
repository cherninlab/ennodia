#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createEnnodiaServer, shutdownEnnodia } from "./server";

const server = createEnnodiaServer();
const transport = new StdioServerTransport();
const SHUTDOWN_DEADLINE_MS = 5_000;
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
  await shutdownEnnodia({ deadlineMs: SHUTDOWN_DEADLINE_MS });
  process.exit(1);
}

async function shutdown(reason: string, exitCode?: number): Promise<void> {
  shutdownPromise ??= Promise.resolve().then(() => closeAndShutdown(reason));

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
      `Failed to close MCP server after ${reason}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  await shutdownEnnodia({ deadlineMs: SHUTDOWN_DEADLINE_MS });
}
