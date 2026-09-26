// Figure 1's drawing on wide screens: one fixed stage, scaled to the column.
// Every box and path is placed in the same 1000-unit frame, so the server
// renders the right paths without script, and the paths meet their boxes
// at every width. Phones stack the same parts along a rail instead.

export const STAGE = { width: 1000, height: 640 };

/** Your chat: one window from your message down to the answer. */
export const CHAT = { x: 0, y: 0, width: 300, height: 640 };
/** The tool call in your chat. The path leaves from its right edge. */
export const CALL_Y = 222;
/** The answer in your chat. The path comes back into its right edge. */
export const ANSWER_Y = 584;

/** The other three agents, stacked between the two lanes. */
export const AGENTS = { x: 612, width: 300, rows: [222, 318, 414] };
/** Where the outbound path turns down to an agent, left of the column. */
const OUT_BUS = 584;
/** Where the return path turns down, right of the column. */
const BACK_BUS = 956;
/** The strip rides the return lane, between the chat and the back bus. */
export const STRIP = { x: 336, y: 488, width: 596, height: 80 };
const RADIUS = 14;

export const percent = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;

/** Outbound: from the tool call, along the top lane, down the bus, and into
 * each active agent row. One subpath per active row. */
export function outPath(rows: number[]): string {
  return rows.map((row) => {
    const y = AGENTS.rows[row]!;
    if (y === CALL_Y) return `M${CHAT.width} ${CALL_Y} H${AGENTS.x}`;
    return [
      `M${CHAT.width} ${CALL_Y}`,
      `H${OUT_BUS - RADIUS}`,
      `Q${OUT_BUS} ${CALL_Y} ${OUT_BUS} ${CALL_Y + RADIUS}`,
      `V${y - RADIUS}`,
      `Q${OUT_BUS} ${y} ${OUT_BUS + RADIUS} ${y}`,
      `H${AGENTS.x}`,
    ].join(" ");
  }).join(" ");
}

/** Return: out of each active agent's far side, down the back bus, and left
 * along the bottom lane into the answer. */
export function backPath(rows: number[]): string {
  const right = AGENTS.x + AGENTS.width;
  const stubs = rows.map((row) => {
    const y = AGENTS.rows[row]!;
    return `M${right} ${y} H${BACK_BUS - RADIUS} Q${BACK_BUS} ${y} ${BACK_BUS} ${y + RADIUS}`;
  });
  const top = Math.min(...rows.map((row) => AGENTS.rows[row]!));
  const lane = [
    `M${BACK_BUS} ${top + RADIUS}`,
    `V${ANSWER_Y - RADIUS}`,
    `Q${BACK_BUS} ${ANSWER_Y} ${BACK_BUS - RADIUS} ${ANSWER_Y}`,
    `H${CHAT.width}`,
  ].join(" ");
  return [...stubs, lane].join(" ");
}

/** Faint connections to every agent: Ennodia reaches all of them. */
export function idlePath(): string {
  const right = AGENTS.x + AGENTS.width;
  const last = AGENTS.rows.at(-1)!;
  return [
    `M${CHAT.width} ${CALL_Y} H${OUT_BUS}`,
    `M${OUT_BUS} ${CALL_Y} V${last}`,
    ...AGENTS.rows.map((y) => `M${OUT_BUS} ${y} H${AGENTS.x}`),
    ...AGENTS.rows.map((y) => `M${right} ${y} H${BACK_BUS}`),
    `M${BACK_BUS} ${AGENTS.rows[0]} V${ANSWER_Y} H${CHAT.width}`,
  ].join(" ");
}

/** Where Compare joins the reviews on the back bus: past every agent row,
 * just above the strip, so it reads as the step before the answer. */
export function comparePoint(_rows: number[]): { x: number; y: number } {
  return { x: BACK_BUS, y: STRIP.y - 18 };
}

/** The four steps you take by hand without Ennodia, placed on the loop. */
export function manualSteps(rows: number[]): { x: number; y: number }[] {
  const y = AGENTS.rows[rows[0]!]!;
  return [
    { x: CHAT.width + 44, y: CALL_Y },
    { x: OUT_BUS, y: y },
    { x: BACK_BUS, y: y + (ANSWER_Y - y) / 2 },
    { x: CHAT.width + 44, y: ANSWER_Y },
  ];
}
