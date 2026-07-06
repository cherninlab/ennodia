import { describe, expect, it } from "bun:test";
import { errorMessage, preview, tailItems, truncate } from "./internal";

describe("internal helpers", () => {
  it("truncates with stable edge-case behavior", () => {
    expect(truncate("abcdef", 6)).toBe("abcdef");
    expect(truncate("abcdef", 5)).toBe("ab...");
    expect(truncate("abcdef", 3)).toBe("...");
    expect(truncate("abcdef", 0)).toBe("");
  });

  it("tails arrays and normalizes previews", () => {
    expect(tailItems([1, 2, 3], 2)).toEqual([2, 3]);
    expect(tailItems([1, 2, 3], 0)).toEqual([]);
    expect(preview("  hello\n\nworld  ")).toBe("hello world");
  });

  it("formats thrown and non-thrown errors", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("boom")).toBe("boom");
  });
});
