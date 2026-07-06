import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type {
  EnnodiaCore,
  DiscoverHarnessesOptions,
  HarnessDiscovery,
  RunCompareMode,
  RunMode,
  RunStartInput,
  RunView,
  RunViewOptions,
} from "ennodia";
import { ENNODIA_VERSION } from "ennodia";
import { errorMessage } from "./internal";

export type EnnodiaIoCore = {
  listHarnesses?(options?: DiscoverHarnessesOptions): Promise<HarnessDiscovery[]>;
  startRun(input: RunStartInput): Promise<RunView>;
  getRun(id: string, options?: RunViewOptions): RunView | undefined;
  waitForRun(
    id: string,
    timeoutMs?: number,
    options?: RunViewOptions,
  ): Promise<RunView | undefined>;
  cancelRun?(id: string): RunView;
};

export type EnnodiaIoHandlerOptions = {
  apiKey?: string;
  maxWaitMs?: number;
  maxRequestBodySize?: number;
  maxConcurrentChatCompletions?: number;
  now?: () => number;
};

export type EnnodiaIoServerOptions = EnnodiaIoHandlerOptions & {
  host?: string;
  port?: number;
};

export type AppProviderOption = {
  id: string;
  label: string;
  kind: "local-agent-cli";
  status: "ready" | "installed" | "missing";
  available: boolean;
  runnable: boolean;
  configured: boolean;
  model: string;
  commandPath?: string;
  appPath?: string;
  version?: string;
  capabilities: string[];
  notes: string[];
  disclosure: string;
};

export type AppProviderOptions = {
  object: "list";
  defaultModel: string;
  compareModel: string;
  options: AppProviderOption[];
};

export type VirtualModel = {
  id: string;
  object: "model";
  owned_by: "local";
  label: string;
  providerId?: string;
  runnable: boolean;
};

type ChatCompletionRequest = z.infer<typeof chatCompletionRequestSchema>;

const DEFAULT_IO_HOST = "127.0.0.1";
const DEFAULT_IO_PORT = 17273;
const DEFAULT_MAX_WAIT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_REQUEST_BODY_SIZE = 2 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_CHAT_COMPLETIONS = 4;
const MAX_OUTPUT_CHARS = 200_000;
const MAX_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_WAIT_MS = 60 * 60 * 1000;
const LOCAL_MODEL_PREFIX = "local/";
const DEFAULT_LOCAL_MODEL = "local/auto";
const COMPARE_LOCAL_MODEL = "local/compare";

const ennodiaOptionsSchema = z
  .object({
    category: z
      .enum(["code", "research", "browser", "image", "general"])
      .optional(),
    harnessId: z.string().min(1).optional(),
    mode: z.enum(["auto", "single", "parallel"]).optional(),
    compare: z.union([z.literal("auto"), z.boolean()]).optional(),
    cwd: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).optional(),
    refresh: z.boolean().optional(),
    judgeHarnessId: z.string().min(1).optional(),
    judgeModel: z.string().min(1).optional(),
    synthesizerHarnessId: z.string().min(1).optional(),
    synthesizerModel: z.string().min(1).optional(),
    maxOutputChars: z.number().int().nonnegative().max(MAX_OUTPUT_CHARS).optional(),
    maxWaitMs: z.number().int().positive().max(MAX_WAIT_MS).optional(),
  })
  .strict();

const chatMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string(),
    name: z.string().min(1).optional(),
  })
  .strict();

const chatCompletionRequestSchema = z
  .object({
    model: z.string().min(1),
    messages: z.array(chatMessageSchema).min(1),
    stream: z.boolean().optional().default(false),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    max_tokens: z.number().int().positive().optional(),
    user: z.string().optional(),
    ennodia: ennodiaOptionsSchema.optional(),
  })
  .strict();

export function createEnnodiaIoHandler(
  core: EnnodiaIoCore,
  options: EnnodiaIoHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const state = {
    activeChatCompletions: 0,
  };

  return async (request) => {
    const unauthorized = authorize(request, options.apiKey);
    if (unauthorized) {
      return unauthorized;
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        status: "ok",
        name: "ennodia-io",
        version: ENNODIA_VERSION,
      });
    }

    if (request.method === "GET" && url.pathname === "/v1/models") {
      return jsonResponse({
        object: "list",
        data: await listVirtualModels(core),
      });
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/v1/provider-options" ||
        url.pathname === "/v1/byok-options")
    ) {
      return jsonResponse(await listAppProviderOptions(core, {
        includeUnavailable: url.searchParams.get("includeUnavailable") !== "false",
      }));
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      return handleChatCompletions(core, request, options, state);
    }

    return jsonError(404, "not_found", `Unsupported route: ${request.method} ${url.pathname}`);
  };
}

export function startEnnodiaIoServer(
  core: EnnodiaCore,
  options: EnnodiaIoServerOptions = {},
): Bun.Server<unknown> {
  const host = options.host ?? DEFAULT_IO_HOST;
  const port = options.port ?? DEFAULT_IO_PORT;

  if (!isLoopbackHost(host) && !options.apiKey) {
    throw new Error(
      "Ennodia IO refuses non-loopback binding without ENNODIA_IO_API_KEY or --api-key.",
    );
  }

  return Bun.serve({
    hostname: host,
    port,
    maxRequestBodySize: options.maxRequestBodySize ??
      DEFAULT_MAX_REQUEST_BODY_SIZE,
    fetch: createEnnodiaIoHandler(core, options),
  });
}

export function chatMessagesToPrompt(
  messages: ChatCompletionRequest["messages"],
): string {
  const blocks = messages
    .map((message) => {
      const content = message.content.trim();
      if (!content) {
        return undefined;
      }

      const name = message.name ? ` (${message.name})` : "";
      return `${titleCaseRole(message.role)}${name}:\n${content}`;
    })
    .filter((block): block is string => block !== undefined);

  if (blocks.length === 0) {
    throw new Error("At least one chat message must contain text content.");
  }

  return blocks.join("\n\n");
}

export async function listAppProviderOptions(
  core: EnnodiaIoCore,
  options: {
    refresh?: boolean;
    includeUnavailable?: boolean;
  } = {},
): Promise<AppProviderOptions> {
  const harnesses = await listHarnessesForIo(core, { refresh: options.refresh });
  const includeUnavailable = options.includeUnavailable ?? true;
  const visibleHarnesses = includeUnavailable
    ? harnesses
    : harnesses.filter((harness) => harness.runnable);

  return {
    object: "list",
    defaultModel: DEFAULT_LOCAL_MODEL,
    compareModel: COMPARE_LOCAL_MODEL,
    options: visibleHarnesses.map(providerOptionFromHarness),
  };
}

export async function listVirtualModels(
  core: EnnodiaIoCore,
  options: {
    refresh?: boolean;
  } = {},
): Promise<VirtualModel[]> {
  const harnesses = await listHarnessesForIo(core, { refresh: options.refresh });
  const runnableHarnesses = harnesses.filter((harness) => harness.runnable);

  return [
    {
      id: DEFAULT_LOCAL_MODEL,
      object: "model",
      owned_by: "local",
      label: "Automatic local agent",
      runnable: runnableHarnesses.length > 0,
    },
    {
      id: COMPARE_LOCAL_MODEL,
      object: "model",
      owned_by: "local",
      label: "Compare local agents",
      runnable: runnableHarnesses.length > 1,
    },
    ...harnesses.map((harness) => ({
      id: modelIdForHarness(harness.id),
      object: "model" as const,
      owned_by: "local" as const,
      label: harness.name,
      providerId: harness.id,
      runnable: harness.runnable,
    })),
  ];
}

async function handleChatCompletions(
  core: EnnodiaIoCore,
  request: Request,
  options: EnnodiaIoHandlerOptions,
  state: {
    activeChatCompletions: number;
  },
): Promise<Response> {
  const maxConcurrentChatCompletions = options.maxConcurrentChatCompletions ??
    DEFAULT_MAX_CONCURRENT_CHAT_COMPLETIONS;
  if (state.activeChatCompletions >= maxConcurrentChatCompletions) {
    return jsonError(
      429,
      "rate_limit_error",
      "Too many in-flight Ennodia IO chat completions.",
      { "retry-after": "1" },
    );
  }

  state.activeChatCompletions += 1;
  try {
    return await handleChatCompletionsInner(core, request, options);
  } finally {
    state.activeChatCompletions -= 1;
  }
}

async function handleChatCompletionsInner(
  core: EnnodiaIoCore,
  request: Request,
  options: EnnodiaIoHandlerOptions,
): Promise<Response> {
  let payload: unknown;

  try {
    payload = await readJsonBody(
      request,
      options.maxRequestBodySize ?? DEFAULT_MAX_REQUEST_BODY_SIZE,
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError(413, "request_too_large", error.message);
    }

    return jsonError(400, "invalid_request_error", "Request body must be JSON.");
  }

  const parsed = chatCompletionRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(400, "invalid_request_error", parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  if (parsed.data.stream) {
    return jsonError(
      400,
      "unsupported_feature",
      "Ennodia IO does not support streaming chat completions yet. Disable streaming on the client and use maxWaitMs for long-running runs.",
    );
  }

  let prompt: string;
  try {
    prompt = chatMessagesToPrompt(parsed.data.messages);
  } catch {
    return jsonError(400, "invalid_request_error", "At least one chat message must contain text content.");
  }

  const modelRoute = routeFromModel(parsed.data.model);
  let run: RunView;
  let finalRun: RunView;
  try {
    run = await core.startRun({
      prompt,
      category: parsed.data.ennodia?.category,
      harnessId: parsed.data.ennodia?.harnessId ?? modelRoute.harnessId,
      mode: (parsed.data.ennodia?.mode as RunMode | undefined) ??
        modelRoute.mode,
      compare: (parsed.data.ennodia?.compare as RunCompareMode | undefined) ??
        modelRoute.compare,
      cwd: parsed.data.ennodia?.cwd,
      model: parsed.data.ennodia?.model,
      timeoutMs: parsed.data.ennodia?.timeoutMs,
      refresh: parsed.data.ennodia?.refresh,
      judgeHarnessId: parsed.data.ennodia?.judgeHarnessId,
      judgeModel: parsed.data.ennodia?.judgeModel,
      synthesizerHarnessId: parsed.data.ennodia?.synthesizerHarnessId,
      synthesizerModel: parsed.data.ennodia?.synthesizerModel,
      maxOutputChars: parsed.data.ennodia?.maxOutputChars,
    });
    finalRun = await waitForRun(core, run.id, {
      maxWaitMs: parsed.data.ennodia?.maxWaitMs ?? options.maxWaitMs,
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof ClientAbortedError) {
      return jsonError(499, "client_closed_request", error.message);
    }

    return jsonError(502, "ennodia_run_error", errorMessage(error));
  }

  if (finalRun.status !== "succeeded") {
    return jsonResponse({
      error: {
        type: "ennodia_run_failed",
        message: finalRun.error ?? `Ennodia run ended with status ${finalRun.status}.`,
      },
      ennodia: runMetadata(finalRun),
    }, 502);
  }

  const now = options.now ?? Date.now;
  return jsonResponse({
    id: `chatcmpl_${finalRun.id}`,
    object: "chat.completion",
    created: Math.floor(now() / 1000),
    model: parsed.data.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: finalRun.finalAnswer ?? "",
        },
        finish_reason: "stop",
      },
    ],
    ennodia: runMetadata(finalRun),
  });
}

async function waitForRun(
  core: EnnodiaIoCore,
  runId: string,
  options: {
    maxWaitMs?: number;
    signal?: AbortSignal;
  },
): Promise<RunView> {
  const run = await waitForRunOrAbort(core, runId, options);

  if (!run) {
    throw new Error(`Ennodia run disappeared: ${runId}`);
  }

  if (run.status === "executing" || run.status === "comparing") {
    throw new Error(`Timed out waiting for Ennodia run: ${runId}`);
  }

  return run;
}

async function waitForRunOrAbort(
  core: EnnodiaIoCore,
  runId: string,
  options: {
    maxWaitMs?: number;
    signal?: AbortSignal;
  },
): Promise<RunView | undefined> {
  if (options.signal?.aborted) {
    core.cancelRun?.(runId);
    throw new ClientAbortedError(runId);
  }

  let removeAbortListener: () => void = () => undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    const signal = options.signal;
    if (!signal) {
      return;
    }

    const onAbort = () => {
      core.cancelRun?.(runId);
      reject(new ClientAbortedError(runId));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", onAbort);
  });

  try {
    return await Promise.race([
      core.waitForRun(
        runId,
        options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
        {
          includeEvents: false,
          maxAnswerChars: MAX_OUTPUT_CHARS,
        },
      ),
      abortPromise,
    ]);
  } finally {
    removeAbortListener();
  }
}

async function listHarnessesForIo(
  core: EnnodiaIoCore,
  options: DiscoverHarnessesOptions = {},
): Promise<HarnessDiscovery[]> {
  if (!core.listHarnesses) {
    return [];
  }

  return core.listHarnesses(options);
}

function providerOptionFromHarness(harness: HarnessDiscovery): AppProviderOption {
  return {
    id: harness.id,
    label: harness.name,
    kind: "local-agent-cli",
    status: harness.runnable
      ? "ready"
      : harness.available
        ? "installed"
        : "missing",
    available: harness.available,
    runnable: harness.runnable,
    configured: harness.runnable,
    model: modelIdForHarness(harness.id),
    commandPath: harness.commandPath,
    appPath: harness.appPath,
    version: harness.version,
    capabilities: harness.capabilities,
    notes: harness.notes,
    disclosure:
      "Runs locally through this installed agent. The agent may contact its own model provider according to its own settings.",
  };
}

function routeFromModel(model: string): {
  harnessId?: string;
  mode?: RunMode;
  compare?: RunCompareMode;
} {
  const normalized = normalizeModelId(model);

  if (normalized === DEFAULT_LOCAL_MODEL) {
    return {};
  }

  if (normalized === COMPARE_LOCAL_MODEL) {
    return { mode: "parallel", compare: true };
  }

  if (normalized.startsWith(LOCAL_MODEL_PREFIX)) {
    const harnessId = normalized.slice(LOCAL_MODEL_PREFIX.length);
    if (harnessId) {
      return { harnessId, mode: "single", compare: false };
    }
  }

  return {};
}

function normalizeModelId(model: string): string {
  switch (model) {
    case "ennodia-auto":
    case "ennodia/auto":
      return DEFAULT_LOCAL_MODEL;
    case "ennodia/compare":
      return COMPARE_LOCAL_MODEL;
    default:
      return model;
  }
}

function modelIdForHarness(harnessId: string): string {
  return `${LOCAL_MODEL_PREFIX}${harnessId}`;
}

function runMetadata(run: RunView) {
  return {
    runId: run.id,
    status: run.status,
    selectedHarnessIds: run.selectedHarnessIds,
    taskIds: run.taskIds,
    compareId: run.compareId,
    budget: run.budget,
  };
}

function authorize(request: Request, apiKey: string | undefined): Response | undefined {
  if (!apiKey) {
    return undefined;
  }

  const authorization = request.headers.get("authorization");
  if (
    authorization &&
    timingSafeEqualText(authorization, `Bearer ${apiKey}`)
  ) {
    return undefined;
  }

  return jsonError(401, "authentication_error", "Missing or invalid Ennodia IO API key.");
}

async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const byteLength = Number(contentLength);
    if (Number.isFinite(byteLength) && byteLength > maxBytes) {
      throw new RequestBodyTooLargeError(maxBytes);
    }
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

class RequestBodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body exceeds Ennodia IO limit of ${maxBytes} bytes.`);
  }
}

class ClientAbortedError extends Error {
  constructor(runId: string) {
    super(`Client closed the request; cancelled Ennodia run ${runId}.`);
  }
}

function timingSafeEqualText(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  const paddedLeft = new Uint8Array(length);
  const paddedRight = new Uint8Array(length);

  paddedLeft.set(leftBytes);
  paddedRight.set(rightBytes);

  return timingSafeEqual(paddedLeft, paddedRight) &&
    leftBytes.length === rightBytes.length;
}

function jsonResponse(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function jsonError(
  status: number,
  type: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse({
    error: {
      type,
      message,
      param: null,
      code: null,
    },
  }, status, headers);
}

function titleCaseRole(role: string): string {
  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]";
}
