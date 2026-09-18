import { describe, expect, it } from "bun:test";
import { harnessAdapters, hasMultimodalInput, withInputGuidance } from "./harnesses";
import { allPriorityHarnessIds } from "./priority";

describe("harness adapters", () => {
  it("runs Kilo Code without auto-approval flags", () => {
    const adapter = harnessAdapters.find((candidate) => candidate.id === "kilo");

    expect(adapter?.buildCommand).toBeDefined();

    const command = adapter?.buildCommand?.("/bin/kilo", {
      prompt: "review this repo",
      cwd: "/tmp/ennodia-fixture",
      model: "provider/model",
    });

    expect(command?.args).toEqual([
      "run",
      "--dir",
      "/tmp/ennodia-fixture",
      "--model",
      "provider/model",
      "--",
      "review this repo",
    ]);
    expect(command?.args).not.toContain("--auto");
    expect(command?.args).not.toContain("--dangerously-skip-permissions");
  });

  it("passes Codex reasoning effort through native model configuration", () => {
    const adapter = harnessAdapters.find((candidate) => candidate.id === "codex");

    expect(adapter?.supportsReasoningEffort).toBe(true);
    const command = adapter?.buildCommand?.("/bin/codex", {
      prompt: "review this repo",
      model: "gpt-5.6-luna",
      reasoningEffort: "max",
    });

    expect(command?.args).toContain("-c");
    expect(command?.args).toContain('model_reasoning_effort="max"');
  });

  it("keeps Codex runs ephemeral by default", () => {
    const adapter = harnessAdapters.find((candidate) => candidate.id === "codex");

    const command = adapter?.buildCommand?.("/bin/codex", {
      prompt: "review this repo",
      cwd: "/tmp/ennodia-fixture",
    });

    expect(command?.args).toEqual([
      "exec",
      "--color",
      "never",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "-C",
      "/tmp/ennodia-fixture",
      "--",
      "review this repo",
    ]);
    expect(command?.args).not.toContain("--json");
  });

  it("uses read-only JSON persistence for a new Codex session", () => {
    const adapter = harnessAdapters.find((candidate) => candidate.id === "codex");

    expect(adapter?.supportsSessionContinuation).toBe(true);
    const command = adapter?.buildCommand?.("/bin/codex", {
      prompt: "continue the review",
      cwd: "/tmp/ennodia-fixture",
      model: "gpt-5.6-luna",
      reasoningEffort: "max",
      persistSession: true,
      continueTaskId: "manager-task-id",
      finalMessagePath: "/tmp/final-message.txt",
    });

    expect(command?.args).toEqual([
      "exec",
      "--color",
      "never",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "-C",
      "/tmp/ennodia-fixture",
      "--model",
      "gpt-5.6-luna",
      "-c",
      'model_reasoning_effort="max"',
      "--json",
      "-o",
      "/tmp/final-message.txt",
      "--",
      "continue the review",
    ]);
    expect(command?.args).not.toContain("--ephemeral");
  });

  it("resumes a Codex session with its exact native ID", () => {
    const adapter = harnessAdapters.find((candidate) => candidate.id === "codex");
    const nativeSessionId = "123e4567-e89b-12d3-a456-426614174000";

    const command = adapter?.buildCommand?.("/bin/codex", {
      prompt: "return the earlier finding",
      cwd: "/tmp/ennodia-fixture",
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
      persistSession: true,
      nativeSessionId,
      finalMessagePath: "/tmp/resumed-message.txt",
    });

    expect(command?.args).toEqual([
      "exec",
      "--color",
      "never",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "-C",
      "/tmp/ennodia-fixture",
      "--model",
      "gpt-5.6-luna",
      "-c",
      'model_reasoning_effort="low"',
      "resume",
      nativeSessionId,
      "--json",
      "-o",
      "/tmp/resumed-message.txt",
      "--",
      "return the earlier finding",
    ]);
    expect(command?.args).not.toContain("--ephemeral");
  });

  it("extracts only a valid native Codex thread.started UUID", () => {
    const adapter = harnessAdapters.find((candidate) => candidate.id === "codex");
    const extractSessionId = adapter?.extractSessionId;
    const nativeSessionId = "123e4567-e89b-12d3-a456-426614174000";

    expect(extractSessionId?.(`A prose mention of ${nativeSessionId}`)).toBeUndefined();
    expect(extractSessionId?.(JSON.stringify({
      type: "thread.started",
      thread_id: "not-a-uuid",
    }))).toBeUndefined();
    expect(extractSessionId?.([
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({ type: "thread.started", thread_id: nativeSessionId }),
    ].join("\n"))).toBe(nativeSessionId);
    expect(extractSessionId?.(JSON.stringify({
      type: "thread.started",
      thread_id: nativeSessionId,
    }).slice(0, -3))).toBeUndefined();
  });

  it("prefers Codex token summaries written to stderr", () => {
    const adapter = harnessAdapters.find((candidate) => candidate.id === "codex");

    const completedTurn = JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 100,
        cached_input_tokens: 80,
        output_tokens: 7,
      },
    });

    expect(adapter?.extractUsage?.([completedTurn, completedTurn].join("\n"), ""))
      .toEqual({
        tokensUsed: 214,
        inputTokens: 200,
        cachedInputTokens: 160,
        outputTokens: 14,
      });
    expect(adapter?.extractUsage?.([
      completedTurn,
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 5, cached_input_tokens: 6, output_tokens: 1 },
      }),
    ].join("\n"), "")).toBeUndefined();
    expect(adapter?.extractUsage?.(JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: Number.MAX_SAFE_INTEGER + 1, output_tokens: 1 },
    }), "")).toBeUndefined();

    for (const type of ["turn.started", "turn.failed"]) {
      expect(adapter?.extractUsage?.(
        [completedTurn, JSON.stringify({ type })].join("\n"),
        "tokens used\n107\n",
      )).toBeUndefined();
    }

    expect(adapter?.extractUsage?.("tokens used\n1,000\n", "tokens used\n55,173\n"))
      .toEqual({ tokensUsed: 55_173 });
    expect(adapter?.extractUsage?.("answer", "user\ntokens used\n1\nnot a summary\ntokens used\n55,173\n"))
      .toEqual({ tokensUsed: 55_173 });
    expect(adapter?.extractUsage?.("answer", "user\ntokens used\n1\nnot a summary"))
      .toBeUndefined();
    expect(adapter?.extractUsage?.("tokens used\n1,000\n", ""))
      .toEqual({ tokensUsed: 1_000 });
  });

  it("runs Hermes Agent through quiet single-query chat without yolo", () => {
    const adapter = harnessAdapters.find((candidate) =>
      candidate.id === "hermes-agent"
    );

    expect(adapter?.buildCommand).toBeDefined();

    const command = adapter?.buildCommand?.("/bin/hermes", {
      prompt: "review this repo",
      cwd: "/tmp/ennodia-fixture",
      model: "provider/model",
    });

    expect(command?.args).toEqual([
      "chat",
      "--query",
      "review this repo",
      "--quiet",
      "--source",
      "ennodia",
      "--model",
      "provider/model",
    ]);
    expect(command?.args).not.toContain("--yolo");
  });

  it("runs Kiro CLI non-interactively without trusting tools by default", () => {
    const adapter = harnessAdapters.find((candidate) => candidate.id === "kiro");

    expect(adapter?.buildCommand).toBeDefined();

    const command = adapter?.buildCommand?.("/bin/kiro-cli", {
      prompt: "review this repo",
      cwd: "/tmp/ennodia-fixture",
      model: "provider/model",
    });

    expect(command?.args).toEqual([
      "chat",
      "--no-interactive",
      "--trust-tools=",
      "--wrap",
      "never",
      "--model",
      "provider/model",
      "--",
      "review this repo",
    ]);
    expect(command?.args).not.toContain("--trust-all-tools");
  });

  it("runs Cline CLI with auto-approval explicitly disabled", () => {
    const adapter = harnessAdapters.find((candidate) => candidate.id === "cline");

    expect(adapter?.buildCommand).toBeDefined();

    const command = adapter?.buildCommand?.("/bin/cline", {
      prompt: "review this repo",
      cwd: "/tmp/ennodia-fixture",
      model: "provider/model",
    });

    expect(command?.args).toEqual([
      "--auto-approve",
      "false",
      "--json",
      "--cwd",
      "/tmp/ennodia-fixture",
      "--model",
      "provider/model",
      "--",
      "review this repo",
    ]);
    expect(command?.args).not.toContain("--zen");
  });

  it("passes Antigravity prompts as the --print value", () => {
    const adapter = harnessAdapters.find((candidate) =>
      candidate.id === "antigravity"
    );

    expect(adapter?.buildCommand).toBeDefined();

    const command = adapter?.buildCommand?.("/bin/agy", {
      prompt: "review this repo",
      cwd: "/tmp/ennodia-fixture",
      model: "gemini-3.7-flash-high",
      timeoutMs: 12_345,
    });

    expect(command?.args).toEqual([
      "--sandbox",
      "--print",
      "review this repo",
      "--print-timeout",
      "13s",
      "--add-dir",
      "/tmp/ennodia-fixture",
      "--model",
      "gemini-3.7-flash-high",
    ]);
    expect(command?.stdin).toBeUndefined();
  });

  it("keeps every priority-list harness backed by a real adapter", () => {
    const adapterIds = new Set(harnessAdapters.map((adapter) => adapter.id));

    for (const priorityId of allPriorityHarnessIds()) {
      expect(adapterIds.has(priorityId)).toBe(true);
    }
  });

  it("scopes Antigravity's native-audio evidence to the observed CLI, model, and sample", () => {
    const adapter = harnessAdapters.find((candidate) => candidate.id === "antigravity");
    const guidance = adapter?.inputGuidance?.join("\n") ?? "";

    expect(guidance).toContain("headless input is text-only");
    expect(guidance).toContain("agy 1.2.0 and gemini-3.8-flash-medium");
    expect(guidance).toContain("eight-second MP3 loaded through view_file");
    expect(guidance).toContain("spoken words absent from the prompt");
    expect(guidance).toContain("scoped observations, not a universal FLAC/WAV support rule");
    expect(guidance).toContain("keep normal permission settings");
  });

  it("recognizes media paths without inferring verified access for other harnesses", () => {
    for (const prompt of ["Inspect /tmp/sample.MP3", "Inspect /tmp/frame.png", "Listen to this recording.", "Compare these recordings.", "Inspect /tmp/reference.ogg", "Assess voice fidelity."]) {
      expect(hasMultimodalInput(prompt)).toBe(true);
      const guided = withInputGuidance(prompt, harnessAdapters.find((adapter) => adapter.id === "codex"));
      expect(guided.startsWith(prompt)).toBe(true);
      expect(guided).toContain("Missing guidance means unverified access");
      expect(guided).not.toContain("gemini-3.8-flash-medium");
    }
    expect(hasMultimodalInput("Review the release plan and listenPort setting.")).toBe(false);
  });
});
