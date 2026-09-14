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
