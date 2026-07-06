#!/usr/bin/env bun
import { createDefaultEnnodiaCore, type EnnodiaCore } from "ennodia";
import { errorMessage } from "./internal";
import { startEnnodiaIoServer } from "./io";

const SHUTDOWN_DEADLINE_MS = 5_000;
const core = createDefaultEnnodiaCore();

try {
  await runIo(core, parseOptions(process.argv.slice(2)));
} catch (error) {
  console.error(errorMessage(error));
  await core.shutdown({ deadlineMs: SHUTDOWN_DEADLINE_MS });
  process.exit(1);
}

type IoCommand = {
  host?: string;
  port?: number;
  apiKey?: string;
  maxRequestBodySize?: number;
  maxConcurrentChatCompletions?: number;
};

async function runIo(
  core: EnnodiaCore,
  command: IoCommand,
): Promise<void> {
  const server = startEnnodiaIoServer(core, {
    host: command.host ?? process.env.ENNODIA_IO_HOST,
    port: command.port ?? parseOptionalPort(process.env.ENNODIA_IO_PORT),
    apiKey: command.apiKey ?? process.env.ENNODIA_IO_API_KEY,
    maxRequestBodySize: command.maxRequestBodySize ??
      parseOptionalPositiveInt(process.env.ENNODIA_IO_MAX_REQUEST_BODY_SIZE),
    maxConcurrentChatCompletions: command.maxConcurrentChatCompletions ??
      parseOptionalPositiveInt(
        process.env.ENNODIA_IO_MAX_CONCURRENT_CHAT_COMPLETIONS,
      ),
  });
  let shutdownPromise: Promise<void> | undefined;

  console.error(
    `Ennodia IO listening on http://${server.hostname}:${server.port}`,
  );

  process.once("SIGINT", () => {
    void shutdown(130);
  });

  process.once("SIGTERM", () => {
    void shutdown(143);
  });

  await new Promise<never>(() => undefined);

  async function shutdown(exitCode: number): Promise<void> {
    shutdownPromise ??= Promise.resolve().then(async () => {
      server.stop(true);
      await core.shutdown({ deadlineMs: SHUTDOWN_DEADLINE_MS });
    });

    await shutdownPromise;
    process.exit(exitCode);
  }
}

function parseOptions(args: string[]): IoCommand {
  const command: IoCommand = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--host") {
      command.host = requireValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--host=")) {
      command.host = arg.slice("--host=".length);
    } else if (arg === "--port") {
      command.port = parsePort(requireValue(args, index, arg));
      index += 1;
    } else if (arg.startsWith("--port=")) {
      command.port = parsePort(arg.slice("--port=".length));
    } else if (arg === "--api-key") {
      command.apiKey = requireValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--api-key=")) {
      command.apiKey = arg.slice("--api-key=".length);
    } else if (arg === "--max-request-body-size") {
      command.maxRequestBodySize = parsePositiveInt(
        requireValue(args, index, arg),
        arg,
      );
      index += 1;
    } else if (arg.startsWith("--max-request-body-size=")) {
      command.maxRequestBodySize = parsePositiveInt(
        arg.slice("--max-request-body-size=".length),
        "--max-request-body-size",
      );
    } else if (arg === "--max-concurrent-chat-completions") {
      command.maxConcurrentChatCompletions = parsePositiveInt(
        requireValue(args, index, arg),
        arg,
      );
      index += 1;
    } else if (arg.startsWith("--max-concurrent-chat-completions=")) {
      command.maxConcurrentChatCompletions = parsePositiveInt(
        arg.slice("--max-concurrent-chat-completions=".length),
        "--max-concurrent-chat-completions",
      );
    } else {
      throw new Error(`Unknown Ennodia IO option: ${arg}`);
    }
  }

  return command;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function parseOptionalPort(value: string | undefined): number | undefined {
  return value ? parsePort(value) : undefined;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid Ennodia IO port: ${value}`);
  }

  return port;
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  return value ? parsePositiveInt(value, "environment variable") : undefined;
}

function parsePositiveInt(value: string, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return number;
}
