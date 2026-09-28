import { describe, expect, it } from "bun:test";
import { AGENTS, ANSWER_Y, CALL_Y, CHAT, STAGE, STRIP, backPath, comparePoint, idlePath, manualSteps, outPath } from "./graph-layout";

// The last point of an SVG path made of absolute commands.
function end(d: string): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const [, command, args] of d.matchAll(/([MHVQ])([^MHVQ]*)/g)) {
    const values = args!.trim().split(/[ ,]+/).filter(Boolean).map(Number);
    if (command === "H") x = values.at(-1)!;
    else if (command === "V") y = values.at(-1)!;
    else [x, y] = values.slice(-2) as [number, number];
  }
  return { x, y };
}

describe("Fig. 2 layout", () => {
  it("runs each outbound path from the tool call into its agent row", () => {
    AGENTS.rows.forEach((row, index) => {
      const d = outPath([index]);
      expect(d.startsWith(`M${CHAT.width} ${CALL_Y}`)).toBe(true);
      expect(end(d)).toEqual({ x: AGENTS.x, y: row });
    });
  });

  it("brings every return path back into the answer", () => {
    for (const rows of [[0], [1], [2], [0, 1], [1, 2]]) {
      expect(end(backPath(rows))).toEqual({ x: CHAT.width, y: ANSWER_Y });
    }
  });

  it("keeps the strip between the lowest agent and the return lane", () => {
    expect(STRIP.y).toBeGreaterThan(AGENTS.rows.at(-1)!);
    expect(STRIP.y + STRIP.height).toBeLessThan(ANSWER_Y);
    expect(STRIP.x + STRIP.width).toBeLessThanOrEqual(STAGE.width);
  });

  it("puts Compare after every agent and before the strip", () => {
    const point = comparePoint([0, 1]);
    expect(point.y).toBeGreaterThan(AGENTS.rows.at(-1)!);
    expect(point.y).toBeLessThan(STRIP.y);
  });

  it("places the four manual steps inside the stage", () => {
    for (const point of manualSteps([2])) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(STAGE.width);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(STAGE.height);
    }
    expect(idlePath()).toContain(`H${AGENTS.x}`);
  });
});
