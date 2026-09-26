// Renders a 1000 by 420 DEV cover for an article with headless Chrome.
//
//   bun run --cwd website make:cover can-gemini-hear-this-file
//
// Set CHROME to another Chrome binary when it is not in the macOS default place.

import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: bun run scripts/make-cover.ts <article-slug>");
  process.exit(1);
}

const root = path.resolve(import.meta.dir, "..");
const source = await readFile(path.join(root, "src", "content", "articles", `${slug}.md`), "utf8");
const field = (key: string) => {
  const raw = source.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1] ?? "";
  try { return String(JSON.parse(raw)); } catch { return raw; }
};
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const date = new Date(field("published")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const template = await readFile(path.join(root, "scripts", "cover.html"), "utf8");
const page = path.join(root, "scripts", `.cover-${slug}.html`);
await writeFile(page, template
  .replace("{{title}}", escape(field("title")))
  .replace("{{kind}}", escape(field("kind")))
  .replace("{{date}}", escape(date)));

const out = path.join(root, "public", "covers", `${slug}.png`);
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const run = Bun.spawn([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
  "--window-size=1000,420", `--screenshot=${out}`, `file://${page}`], { stdout: "ignore", stderr: "ignore" });
const code = await run.exited;
await rm(page, { force: true });
if (code !== 0) throw new Error(`Chrome exited with code ${code}.`);
console.log(path.relative(process.cwd(), out));
