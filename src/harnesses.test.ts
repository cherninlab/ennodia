import { describe, expect, it } from "bun:test";
import { harnessAdapters } from "./harnesses";

describe("harness adapters", () => {
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
