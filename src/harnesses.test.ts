import { describe, expect, it } from "bun:test";
import { harnessAdapters } from "./harnesses";

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
      "review this repo",
    ]);
    expect(command?.args).not.toContain("--zen");
  });

  it("sends Antigravity prompts through stdin instead of argv", () => {
    const adapter = harnessAdapters.find((candidate) =>
      candidate.id === "antigravity"
    );

    expect(adapter?.buildCommand).toBeDefined();

    const command = adapter?.buildCommand?.("/bin/agy", {
      prompt: "do not put this prompt in argv",
      cwd: "/tmp/ennodia-fixture",
      timeoutMs: 12_345,
    });

    expect(command?.args).toContain("--print");
    expect(command?.args).toContain("--print-timeout");
    expect(command?.args).toContain("13s");
    expect(command?.args).toContain("--add-dir");
    expect(command?.args).toContain("/tmp/ennodia-fixture");
    expect(command?.args).not.toContain("do not put this prompt in argv");
    expect(command?.stdin).toBe("do not put this prompt in argv");
  });
});
