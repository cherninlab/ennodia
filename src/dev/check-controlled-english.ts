import { readFileSync } from "node:fs";

const FORBIDDEN_GENERAL_WORDS =
  /\b(?:ask|whether|several|enough|should|already|instead)\b/i;
const PROCEDURE_START =
  /^(?:Run|Use|Set|Add|Open|Call|Pass|Start|Poll|Select|Choose|Install|Create|Copy|Keep|Do|Request|Check|Read|See|Configure|Review|Repeat|Stop|Wait|Enter|Remove|Replace|Save|Verify)\b/;
const FIXED_TAGLINE = "AI makes mistakes";

type Finding = {
  source: string;
  message: string;
  text: string;
};

const findings: Finding[] = [];
const markdownFiles = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "bench/README.md",
  "packages/ennodia-io/README.md",
  ...await Array.fromAsync(
    new Bun.Glob("docs/**/*.md").scan({ cwd: ".", absolute: false }),
  ),
];

for (const file of markdownFiles.sort()) {
  checkMarkdown(file);
}

checkRenderedLandingPage("website/dist/index.html");

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.source}: ${finding.message}: ${finding.text}`);
  }
  throw new Error(
    `Controlled-English check found ${findings.length} deterministic issue(s).`,
  );
}

console.log(
  `Controlled-English deterministic checks passed for ${markdownFiles.length} Markdown files and the rendered landing page.`,
);

function checkMarkdown(file: string): void {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  let inFence = false;
  let inFrontMatter = lines[0] === "---";
  let paragraph: string[] = [];

  const checkParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    const text = cleanMarkdown(paragraph.join(" "));
    checkText(file, text, true);
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (index === 0 && inFrontMatter) {
      continue;
    }
    if (inFrontMatter) {
      if (line === "---") {
        inFrontMatter = false;
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      checkParagraph();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const prose = cleanMarkdown(line);
    checkRestrictedForms(`${file}:${index + 1}`, prose);

    const isolatedLine =
      !line.trim() || /^\s*(?:#{1,6}\s|[-*+] |\d+[.)] |\|)/.test(line);
    if (isolatedLine) {
      checkParagraph();
      if (line.trim()) {
        paragraph.push(line);
        checkParagraph();
      }
    } else {
      paragraph.push(line);
    }
  }

  checkParagraph();
}

function checkRenderedLandingPage(file: string): void {
  let html = readFileSync(file, "utf8");
  html = html
    .replace(/<(script|style|svg|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, " ");

  const textNodes = [...html.matchAll(/>([^<>]+)</g)]
    .map((match) => decodeHtml(match[1] ?? "").replace(/\s+/g, " ").trim())
    .filter((text) => /[A-Za-z]/.test(text));

  if (!textNodes.includes(FIXED_TAGLINE)) {
    findings.push({
      source: file,
      message: "fixed tagline is missing or changed",
      text: FIXED_TAGLINE,
    });
  }

  for (const text of textNodes) {
    checkRestrictedForms(file, text);
    checkText(file, text, false);
  }
}

function checkRestrictedForms(source: string, text: string): void {
  if (text.includes(";")) {
    findings.push({ source, message: "prose semicolon", text });
  }
  if (FORBIDDEN_GENERAL_WORDS.test(text)) {
    findings.push({ source, message: "restricted general word", text });
  }
}

function checkText(source: string, text: string, checkParagraph: boolean): void {
  if (!text) {
    return;
  }

  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];

  if (checkParagraph && sentences.length > 6) {
    findings.push({
      source,
      message: `paragraph has ${sentences.length} sentences (maximum 6)`,
      text,
    });
  }

  for (const sentence of sentences) {
    const procedure = PROCEDURE_START.test(sentence);
    const maximum = procedure ? 20 : 25;
    const count = wordCount(sentence);
    if (count > maximum) {
      findings.push({
        source,
        message: `${procedure ? "procedure" : "description"} has ${count} words (maximum ${maximum})`,
        text: sentence,
      });
    }
  }
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/`[^`]*`/g, "CODE")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s*(?:[-*+] |\d+[.)] )/, "")
    .trim();
}

function wordCount(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
}

function decodeHtml(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_match, digits: string) =>
      String.fromCodePoint(Number(digits))
    )
    .replace(/&[A-Za-z][A-Za-z0-9]+;/g, " ");
}
