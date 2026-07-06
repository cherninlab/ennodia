import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type AgentGlyph = {
  id: string;
  label: string;
  source: string;
  codepoint: number;
  pathIndexes?: number[];
  pathMatcher?: (path: string) => boolean;
};

const repoRoot = resolve(import.meta.dir, "../..");
const sourceDir = join(repoRoot, "docs/assets/agents");
const buildDir = join(repoRoot, ".tmp/agent-font-source");
const configRelativePath = ".tmp/agent-font-source/fantasticon.config.cjs";
const outputDir = join(repoRoot, "docs/assets/agent-font");
const fontName = "ennodia-agents";

const glyphs: AgentGlyph[] = [
  {
    id: "antigravity",
    label: "Antigravity",
    source: "antigravity-color.svg",
    codepoint: 0xe001,
    pathIndexes: [0],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    source: "claudecode-color.svg",
    codepoint: 0xe002,
  },
  {
    id: "cline",
    label: "Cline",
    source: "cline.svg",
    codepoint: 0xe003,
  },
  {
    id: "codex",
    label: "Codex CLI",
    source: "codex-color.svg",
    codepoint: 0xe004,
    pathIndexes: [1],
  },
  {
    id: "hermes-agent",
    label: "Hermes Agent",
    source: "hermesagent.svg",
    codepoint: 0xe005,
  },
  {
    id: "kilo-code",
    label: "Kilo Code",
    source: "kilocode.svg",
    codepoint: 0xe006,
  },
  {
    id: "kiro",
    label: "Kiro CLI",
    source: "kiro.svg",
    codepoint: 0xe007,
  },
  {
    id: "opencode",
    label: "OpenCode",
    source: "opencode-light.svg",
    codepoint: 0xe008,
    pathMatcher: (path) => path.includes("M180 60H60v180h120"),
  },
  {
    id: "mcp",
    label: "MCP",
    source: "mcp.svg",
    codepoint: 0xe009,
  },
  {
    id: "langgraph",
    label: "LangGraph",
    source: "langgraph.svg",
    codepoint: 0xe00a,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    source: "openrouter.svg",
    codepoint: 0xe00b,
  },
];

await rm(buildDir, { recursive: true, force: true });
await rm(outputDir, { recursive: true, force: true });
await mkdir(buildDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

for (const glyph of glyphs) {
  const source = await readFile(join(sourceDir, glyph.source), "utf8");
  await writeFile(join(buildDir, `${glyph.id}.svg`), normalizeSvg(glyph, source));
}

const configPath = join(buildDir, "fantasticon.config.cjs");
await writeFile(configPath, renderFantasticonConfig());

await run([
  "bunx",
  "fantasticon",
  "--config",
  configRelativePath,
]);

await writeFile(
  join(outputDir, `${fontName}.css`),
  renderCss(),
);

await rm(buildDir, { recursive: true, force: true });

console.log(
  JSON.stringify(
    {
      font: fontName,
      outputDir,
      glyphs: glyphs.map((glyph) => ({
        id: glyph.id,
        codepoint: `U+${glyph.codepoint.toString(16).toUpperCase()}`,
      })),
    },
    null,
    2,
  ),
);

function normalizeSvg(glyph: AgentGlyph, source: string): string {
  const viewBox = source.match(/\bviewBox="([^"]+)"/)?.[1] ?? "0 0 24 24";
  const paths = [...source.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)]
    .map((match) => match[1])
    .filter((path): path is string => Boolean(path));
  const selectedPaths = selectPaths(glyph, paths);

  if (selectedPaths.length === 0) {
    throw new Error(`No paths selected for ${glyph.id}.`);
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
    `<title>${escapeXml(glyph.label)}</title>`,
    ...selectedPaths.map((path) =>
      `<path fill="#000" fill-rule="evenodd" d="${path}"/>`
    ),
    "</svg>",
  ].join("");
}

function selectPaths(glyph: AgentGlyph, paths: string[]): string[] {
  if (glyph.pathIndexes) {
    return glyph.pathIndexes.map((index) => paths[index]).filter(
      (path): path is string => Boolean(path),
    );
  }

  if (glyph.pathMatcher) {
    return paths.filter(glyph.pathMatcher);
  }

  return paths.filter((path) => !isFullCanvasRect(path));
}

function isFullCanvasRect(path: string): boolean {
  return path === "M240 0H0v300h240z" ||
    path === "M0 0h240v300H0z" ||
    path === "M0 0h24v24H0z";
}

function renderFantasticonConfig(): string {
  const codepoints = Object.fromEntries(
    glyphs.map((glyph) => [glyph.id, glyph.codepoint]),
  );

  return [
    "module.exports = {",
    `  inputDir: ${JSON.stringify(buildDir)},`,
    `  outputDir: ${JSON.stringify(outputDir)},`,
    `  name: ${JSON.stringify(fontName)},`,
    "  fontTypes: ['woff2', 'woff'],",
    "  assetTypes: ['json'],",
    "  fontHeight: 1000,",
    "  descent: 0,",
    "  normalize: true,",
    "  formatOptions: { json: { indent: 2 } },",
    `  codepoints: ${JSON.stringify(codepoints, null, 2)},`,
    "};",
  ].join("\n");
}

function renderCss(): string {
  const classes = glyphs.map((glyph) =>
    `.agent-logo--${glyph.id}::before { content: "\\${glyph.codepoint.toString(16)}"; }`
  );

  return [
    "@font-face {",
    `  font-family: "Ennodia Agent Logos";`,
    `  src: url("./${fontName}.woff2") format("woff2"), url("./${fontName}.woff") format("woff");`,
    "  font-display: block;",
    "  font-style: normal;",
    "  font-weight: 400;",
    "}",
    "",
    ".agent-logo {",
    `  font-family: "Ennodia Agent Logos";`,
    "  display: inline-block;",
    "  width: 1em;",
    "  height: 1em;",
    "  color: currentColor;",
    "  direction: ltr;",
    "  font-feature-settings: normal;",
    "  font-size: 1em;",
    "  font-style: normal;",
    "  font-variant: normal;",
    "  font-weight: 400;",
    "  letter-spacing: 0;",
    "  line-height: 1;",
    "  text-rendering: geometricPrecision;",
    "  text-transform: none;",
    "  vertical-align: -0.12em;",
    "  -moz-osx-font-smoothing: grayscale;",
    "  -webkit-font-smoothing: antialiased;",
    "}",
    "",
    ".agent-logo::before {",
    "  display: block;",
    "}",
    "",
    ...classes,
    "",
  ].join("\n");
}

async function run(command: string[]): Promise<void> {
  const process = Bun.spawn(command, {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await process.exited;

  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with ${exitCode}.`);
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
