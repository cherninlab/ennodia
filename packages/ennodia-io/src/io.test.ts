import { describe, expect, it } from "bun:test";
import {
  chatMessagesToPrompt,
  createEnnodiaIoHandler,
  listAppProviderOptions,
  listVirtualModels,
  type EnnodiaIoCore,
} from "./io";
import type {
  HarnessDiscovery,
  RunStartInput,
  RunView,
  RunViewOptions,
} from "ennodia";

describe("Ennodia IO", () => {
  it("maps chat completions to Ennodia runs", async () => {
    const core = new FakeIoCore();
    const handler = createEnnodiaIoHandler(core, {
      now: () => 1_700_000_000_000,
    });

    const response = await handler(jsonRequest("/v1/chat/completions", {
      model: "local/auto",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Say hello." },
      ],
      ennodia: {
        harnessId: "codex",
        mode: "single",
        compare: false,
        model: "gpt-test",
      },
    }));
    const body = await response.json() as ChatCompletionResponse;

    expect(response.status).toBe(200);
    expect(body.object).toBe("chat.completion");
    expect(body.model).toBe("local/auto");
    expect(body.created).toBe(1_700_000_000);
    expect(body.choices[0]?.message.content).toBe("answer from io");
    expect(body.ennodia.runId).toBe("run-1");
    expect(core.started[0]?.prompt).toContain("System:\nBe concise.");
    expect(core.started[0]?.prompt).toContain("User:\nSay hello.");
    expect(core.waitTimeouts[0]).toBe(600_000);
    expect(core.started[0]?.harnessId).toBe("codex");
    expect(core.started[0]?.model).toBe("gpt-test");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("passes request maxWaitMs and category through to Ennodia", async () => {
    const core = new FakeIoCore();
    const handler = createEnnodiaIoHandler(core);

    const response = await handler(jsonRequest("/v1/chat/completions", {
      model: "local/auto",
      messages: [{ role: "user", content: "Classify this directly." }],
      ennodia: {
        category: "research",
        maxWaitMs: 1_234,
      },
    }));

    expect(response.status).toBe(200);
    expect(core.started[0]?.category).toBe("research");
    expect(core.waitTimeouts[0]).toBe(1_234);
  });

  it("lists app-facing provider options for BYOK-style settings", async () => {
    const core = new FakeIoCore();

    const options = await listAppProviderOptions(core);

    expect(options.defaultModel).toBe("local/auto");
    expect(options.compareModel).toBe("local/compare");
    expect(options.options.map((option) => option.model)).toEqual([
      "local/codex",
      "local/claude-code",
    ]);
    expect(options.options[0]).toMatchObject({
      id: "codex",
      label: "Codex CLI",
      kind: "local-agent-cli",
      status: "ready",
      configured: true,
      runnable: true,
    });
    expect(options.options[0]?.disclosure).toContain("installed agent");
  });

  it("serves provider options and virtual models over HTTP", async () => {
    const core = new FakeIoCore();
    const handler = createEnnodiaIoHandler(core);

    const providerResponse = await handler(new Request(
      "http://127.0.0.1/v1/provider-options",
    ));
    const modelResponse = await handler(new Request(
      "http://127.0.0.1/v1/models",
    ));
    const providers = await providerResponse.json() as ProviderOptionsResponse;
    const models = await modelResponse.json() as ModelsResponse;

    expect(providerResponse.status).toBe(200);
    expect(providers.options.some((option) => option.model === "local/codex"))
      .toBe(true);
    expect(modelResponse.status).toBe(200);
    expect(models.data.map((model) => model.id)).toEqual([
      "local/auto",
      "local/compare",
      "local/codex",
      "local/claude-code",
    ]);
  });

  it("filters unavailable provider options when requested", async () => {
    const core = new FakeIoCore();
    const handler = createEnnodiaIoHandler(core);

    const response = await handler(new Request(
      "http://127.0.0.1/v1/provider-options?includeUnavailable=false",
    ));
    const providers = await response.json() as ProviderOptionsResponse;

    expect(providers.options.map((option) => option.id)).toEqual(["codex"]);
  });

  it("routes local model IDs to the selected harness", async () => {
    const core = new FakeIoCore();
    const handler = createEnnodiaIoHandler(core);

    const response = await handler(jsonRequest("/v1/chat/completions", {
      model: "local/codex",
      messages: [{ role: "user", content: "Use Codex." }],
    }));

    expect(response.status).toBe(200);
    expect(core.started[0]?.harnessId).toBe("codex");
    expect(core.started[0]?.mode).toBe("single");
    expect(core.started[0]?.compare).toBe(false);
  });

  it("routes the compare model to parallel Compare", async () => {
    const core = new FakeIoCore();
    const handler = createEnnodiaIoHandler(core);

    const response = await handler(jsonRequest("/v1/chat/completions", {
      model: "local/compare",
      messages: [{ role: "user", content: "Compare options." }],
    }));

    expect(response.status).toBe(200);
    expect(core.started[0]?.mode).toBe("parallel");
    expect(core.started[0]?.compare).toBe(true);
  });

  it("rejects streaming instead of pretending to support it", async () => {
    const core = new FakeIoCore();
    const handler = createEnnodiaIoHandler(core);

    const response = await handler(jsonRequest("/v1/chat/completions", {
      model: "ennodia-auto",
      stream: true,
      messages: [{ role: "user", content: "Stream this." }],
    }));
    const body = await response.json() as ErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error.type).toBe("unsupported_feature");
    expect(body.error.param).toBeNull();
    expect(body.error.code).toBeNull();
    expect(core.started).toHaveLength(0);
  });

  it("cancels an in-flight run when the non-streaming client aborts", async () => {
    const core = new FakeIoCore();
    const controller = new AbortController();
    core.setWaitPromise(new Promise(() => undefined));
    const handler = createEnnodiaIoHandler(core);

    const pending = handler(jsonRequest("/v1/chat/completions", {
      model: "ennodia-auto",
      messages: [{ role: "user", content: "Abort this." }],
    }, {}, controller.signal));
    await waitUntil(() => core.waitTimeouts.length === 1);
    controller.abort();
    const response = await pending;
    const body = await response.json() as ErrorResponse;

    expect(response.status).toBe(499);
    expect(body.error.type).toBe("client_closed_request");
    expect(core.cancelled).toEqual(["run-1"]);
  });

  it("requires bearer auth when an IO API key is configured", async () => {
    const core = new FakeIoCore();
    const handler = createEnnodiaIoHandler(core, { apiKey: "secret" });

    const denied = await handler(jsonRequest("/v1/chat/completions", {
      model: "ennodia-auto",
      messages: [{ role: "user", content: "Hello." }],
    }));
    const wrongLength = await handler(jsonRequest("/v1/chat/completions", {
      model: "ennodia-auto",
      messages: [{ role: "user", content: "Hello." }],
    }, {
      authorization: "Bearer no",
    }));
    const allowed = await handler(jsonRequest("/v1/chat/completions", {
      model: "ennodia-auto",
      messages: [{ role: "user", content: "Hello." }],
    }, {
      authorization: "Bearer secret",
    }));
    const deniedBody = await denied.json() as ErrorResponse;

    expect(denied.status).toBe(401);
    expect(wrongLength.status).toBe(401);
    expect(deniedBody.error.type).toBe("authentication_error");
    expect(allowed.status).toBe(200);
  });

  it("rejects oversized chat bodies with a structured 413", async () => {
    const core = new FakeIoCore();
    const handler = createEnnodiaIoHandler(core, { maxRequestBodySize: 120 });

    const response = await handler(jsonRequest("/v1/chat/completions", {
      model: "ennodia-auto",
      messages: [{ role: "user", content: "x".repeat(200) }],
    }));
    const body = await response.json() as ErrorResponse;

    expect(response.status).toBe(413);
    expect(body.error.type).toBe("request_too_large");
    expect(core.started).toHaveLength(0);
  });

  it("returns 429 when chat completions are saturated", async () => {
    const core = new FakeIoCore();
    let releaseWait: (run: RunView) => void = () => undefined;
    core.setWaitPromise(new Promise((resolve) => {
      releaseWait = resolve;
    }));
    const handler = createEnnodiaIoHandler(core, {
      maxConcurrentChatCompletions: 1,
    });

    const first = handler(jsonRequest("/v1/chat/completions", {
      model: "ennodia-auto",
      messages: [{ role: "user", content: "Hold this request." }],
    }));
    await waitUntil(() => core.started.length === 1);

    const saturated = await handler(jsonRequest("/v1/chat/completions", {
      model: "ennodia-auto",
      messages: [{ role: "user", content: "Second request." }],
    }));
    const body = await saturated.json() as ErrorResponse;

    releaseWait(makeRunView({ id: "run-1" }));
    await first;

    expect(saturated.status).toBe(429);
    expect(saturated.headers.get("retry-after")).toBe("1");
    expect(body.error.type).toBe("rate_limit_error");
  });

  it("returns a run timeout error when waitForRun stays non-terminal", async () => {
    const core = new FakeIoCore();
    core.setWaitResult(makeRunView({
      id: "run-1",
      status: "executing",
      endedAt: undefined,
      finalAnswer: undefined,
      finalAnswerChars: 0,
    }));
    const handler = createEnnodiaIoHandler(core, { maxWaitMs: 10 });

    const response = await handler(jsonRequest("/v1/chat/completions", {
      model: "ennodia-auto",
      messages: [{ role: "user", content: "Timeout." }],
    }));
    const body = await response.json() as ErrorResponse;

    expect(response.status).toBe(502);
    expect(body.error.type).toBe("ennodia_run_error");
    expect(body.error.message).toContain("Timed out waiting for Ennodia run");
  });

  it("returns a run error when the waited run disappears", async () => {
    const core = new FakeIoCore();
    core.setWaitResult(undefined);
    const handler = createEnnodiaIoHandler(core);

    const response = await handler(jsonRequest("/v1/chat/completions", {
      model: "ennodia-auto",
      messages: [{ role: "user", content: "Disappear." }],
    }));
    const body = await response.json() as ErrorResponse;

    expect(response.status).toBe(502);
    expect(body.error.type).toBe("ennodia_run_error");
    expect(body.error.message).toContain("Ennodia run disappeared");
  });

  it("returns run metadata when the waited run fails", async () => {
    const core = new FakeIoCore();
    core.setWaitResult(makeRunView({
      id: "run-1",
      status: "failed",
      error: "child task failed",
      finalAnswer: undefined,
      finalAnswerChars: 0,
    }));
    const handler = createEnnodiaIoHandler(core);

    const response = await handler(jsonRequest("/v1/chat/completions", {
      model: "ennodia-auto",
      messages: [{ role: "user", content: "Fail." }],
    }));
    const body = await response.json() as ErrorResponse & {
      ennodia: { runId: string; status: string };
    };

    expect(response.status).toBe(502);
    expect(body.error.type).toBe("ennodia_run_failed");
    expect(body.error.message).toBe("child task failed");
    expect(body.ennodia).toMatchObject({ runId: "run-1", status: "failed" });
  });

  it("formats supported chat messages predictably", () => {
    expect(chatMessagesToPrompt([
      { role: "system", content: "Rules" },
      { role: "assistant", name: "prior", content: "Earlier answer" },
      { role: "user", content: "Next request" },
    ])).toBe(
      [
        "System:\nRules",
        "Assistant (prior):\nEarlier answer",
        "User:\nNext request",
      ].join("\n\n"),
    );
  });

  it("can build virtual models directly for app settings", async () => {
    const models = await listVirtualModels(new FakeIoCore());

    expect(models[0]).toMatchObject({
      id: "local/auto",
      label: "Automatic local agent",
      runnable: true,
    });
    expect(models[1]).toMatchObject({
      id: "local/compare",
      label: "Compare local agents",
      runnable: false,
    });
  });
});

type ChatCompletionResponse = {
  object: string;
  created: number;
  model: string;
  choices: {
    message: {
      content: string;
    };
  }[];
  ennodia: {
    runId: string;
  };
};

type ErrorResponse = {
  error: {
    type: string;
    message: string;
    param: null;
    code: null;
  };
};

type ProviderOptionsResponse = {
  options: {
    id: string;
    model: string;
  }[];
};

type ModelsResponse = {
  data: {
    id: string;
  }[];
};

class FakeIoCore implements EnnodiaIoCore {
  readonly started: RunStartInput[] = [];
  readonly waitTimeouts: Array<number | undefined> = [];
  readonly cancelled: string[] = [];
  private readonly runs = new Map<string, RunView>();
  private waitOverride?: {
    value: RunView | undefined | Promise<RunView | undefined>;
  };

  async listHarnesses(): Promise<HarnessDiscovery[]> {
    return fakeHarnesses;
  }

  async startRun(input: RunStartInput): Promise<RunView> {
    this.started.push(input);
    const run = makeRunView({
      id: `run-${this.started.length}`,
      promptPreview: input.prompt.slice(0, 80),
      selectedHarnessIds: input.harnessId ? [input.harnessId] : ["codex"],
      finalAnswer: "answer from io",
    });
    this.runs.set(run.id, run);
    return run;
  }

  getRun(id: string, _options: RunViewOptions = {}): RunView | undefined {
    return this.runs.get(id);
  }

  async waitForRun(
    id: string,
    timeoutMs?: number,
    _options: RunViewOptions = {},
  ): Promise<RunView | undefined> {
    this.waitTimeouts.push(timeoutMs);
    if (this.waitOverride) {
      return this.waitOverride.value;
    }

    return this.runs.get(id);
  }

  setWaitResult(run: RunView | undefined): void {
    this.waitOverride = { value: run };
  }

  setWaitPromise(run: Promise<RunView | undefined>): void {
    this.waitOverride = { value: run };
  }

  cancelRun(id: string): RunView {
    this.cancelled.push(id);
    const run = makeRunView({
      id,
      status: "cancelled",
      endedAt: new Date(0).toISOString(),
      finalAnswer: undefined,
      finalAnswerChars: 0,
    });
    this.runs.set(id, run);
    return run;
  }
}

const fakeHarnesses: HarnessDiscovery[] = [
  {
    id: "codex",
    name: "Codex CLI",
    kind: "cli",
    available: true,
    runnable: true,
    commandPath: "/usr/local/bin/codex",
    version: "codex-cli 1.0.0",
    capabilities: ["code", "agents"],
    notes: ["Uses the supported Codex CLI surface."],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    kind: "cli",
    available: true,
    runnable: false,
    appPath: "/Applications/Claude.app",
    capabilities: ["code", "agents"],
    notes: ["CLI command not found."],
  },
];

function jsonRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Request {
  return new Request(`http://127.0.0.1${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal,
  });
}

function makeRunView(overrides: Partial<RunView> = {}): RunView {
  return {
    id: "run-1",
    status: "succeeded",
    mode: "single",
    compareMode: false,
    promptPreview: "prompt",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    endedAt: new Date(0).toISOString(),
    elapsedMs: 0,
    plan: {
      category: "general",
      reasons: ["test"],
      candidates: ["codex"],
      selected: "codex",
      parallelSuggested: false,
      compareSuggested: false,
    },
    selectedHarnessIds: ["codex"],
    taskIds: ["task-1"],
    remainingMs: 0,
    etaConfidence: "complete",
    finalAnswer: "answer from io",
    finalAnswerChars: "answer from io".length,
    eventCount: 0,
    events: [],
    budget: {
      estimate: {
        selectedHarnessCount: 1,
        selectedHarnessIds: ["codex"],
        comparePlanned: false,
        maxOutputCharsPerCandidate: 80_000,
        estimatedPromptTokensPerTask: 1,
        estimatedChildTaskInputTokens: 1,
        estimatedCompareInputTokens: 0,
        estimatedTotalInputTokens: 1,
        tokenEstimateRatio: "1 token ~= 4 characters",
        assumptions: [],
        subscriptionLimitChecks: [],
      },
      exceeded: false,
      issues: [],
    },
    ...overrides,
  };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for condition.");
}
