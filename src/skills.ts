import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { cp, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { errorMessage } from "./internal";

export type SkillSource = "project" | "user" | "builtin" | "legacy";
export type SkillScope = "project" | "user" | "builtin" | "legacy";

export type SkillInstallation = {
  path: string;
  source: SkillSource;
  scope: SkillScope;
  harnessIds: string[];
  native: boolean;
};

export type Skill = {
  id: string;
  name: string;
  version: string;
  description: string;
  instructions: string;
  hash: string;
  source: SkillSource;
  path: string;
  harnessIds: string[];
  installations: SkillInstallation[];
  native: boolean;
};

export type AppliedSkillInfo = {
  id: string;
  name: string;
  version: string;
  hash: string;
  source: SkillSource;
  harnessIds: string[];
  native: boolean;
};

export type SkillSummary = AppliedSkillInfo & {
  description: string;
  path: string;
  instructionsChars: number;
  installations: SkillInstallation[];
};

export type SkillDiscovery = {
  skills: SkillSummary[];
  searchedDirectories: string[];
  warnings: string[];
};

export type SkillInstallTarget = {
  harnessId: string;
  scope: "project" | "user";
  directory: string;
};

export type SkillInstallAction = SkillInstallTarget & {
  skillId: string;
  skillName: string;
  sourcePath: string;
  targetPath: string;
  status: "planned" | "installed" | "skipped";
  reason?: string;
};

export type InstallBundledSkillsInput = {
  skillIds?: string[];
  harnessIds?: string[];
  scope?: "project" | "user";
  cwd?: string;
  overwrite?: boolean;
  dryRun?: boolean;
};

export type InstallBundledSkillsResult = {
  dryRun: boolean;
  actions: SkillInstallAction[];
};

type SkillDirectory = {
  path: string;
  source: SkillSource;
  scope: SkillScope;
  harnessIds: string[];
  format: "agent-skill" | "legacy";
  native: boolean;
};

type RawSkill = {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  instructions?: string;
};

type LoadedSkillDiscovery = {
  skills: Skill[];
  searchedDirectories: string[];
  warnings: string[];
};

const MAX_SKILL_INSTRUCTIONS_CHARS = 80_000;
const SKILL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BUNDLED_SKILLS_DIR = fileURLToPath(new URL("../skills", import.meta.url));

export function getSkillsDirectories(cwd?: string): string[] {
  return getSkillDirectories(cwd).map((dir) => dir.path);
}

export async function loadSkillFromFile(
  filePath: string,
  source: SkillSource = "project",
  harnessIds: string[] = ["generic"],
  native = true,
): Promise<Skill> {
  const content = await readFile(filePath, "utf-8");
  const extension = extname(filePath).toLowerCase();
  const raw = extension === ".json"
    ? parseJsonSkill(content, filePath)
    : parseMarkdownSkill(content, filePath);

  return normalizeSkill(raw, filePath, source, harnessIds, native);
}

export async function discoverSkills(cwd?: string): Promise<Skill[]> {
  const discovery = await loadAvailableSkills(cwd);
  return discovery.skills;
}

export async function discoverSkillsWithWarnings(
  cwd?: string,
): Promise<SkillDiscovery> {
  const discovery = await loadAvailableSkills(cwd);
  return {
    skills: discovery.skills.map(toSkillSummary),
    searchedDirectories: discovery.searchedDirectories,
    warnings: discovery.warnings,
  };
}

export async function loadSkillsByIds(
  ids: string[],
  cwd?: string,
): Promise<Skill[]> {
  if (ids.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(ids)];
  const discovery = await loadAvailableSkills(cwd);
  const skillsById = new Map(discovery.skills.map((skill) => [skill.id, skill]));
  const skills: Skill[] = [];

  for (const id of uniqueIds) {
    const skill = skillsById.get(id);
    if (!skill) {
      const available = discovery.skills.map((s) => s.id).sort().join(", ");
      throw new Error(
        available
          ? `Skill not found: ${id}. Available skills: ${available}`
          : `Skill not found: ${id}. No skills were discovered.`,
      );
    }

    skills.push(skill);
  }

  return skills;
}

export async function loadRunnableSkillsByIds(
  ids: string[],
  cwd?: string,
): Promise<Skill[]> {
  const skills = await loadSkillsByIds(ids, cwd);
  const installableOnly = skills.filter((skill) => !skill.native);

  if (installableOnly.length > 0) {
    throw new Error(
      `Skill is not installed in a native harness location: ${
        installableOnly.map((skill) => skill.id).join(", ")
      }. Use ennodia_install_skills first, then retry.`,
    );
  }

  return skills;
}

export function skillsForHarness(skills: Skill[], harnessId: string): Skill[] {
  return skills.filter((skill) => skillSupportsHarness(skill, harnessId));
}

export function augmentPrompt(
  prompt: string,
  skills: Skill[],
  harnessId?: string,
): string {
  if (skills.length === 0) {
    return prompt;
  }

  const usable = harnessId
    ? skills.filter((skill) => skillSupportsHarness(skill, harnessId))
    : skills;
  const unavailable = harnessId
    ? skills.filter((skill) => !skillSupportsHarness(skill, harnessId))
    : [];

  if (unavailable.length > 0) {
    throw new Error(
      `Skill is not installed for ${harnessId}: ${
        unavailable.map((skill) => skill.id).join(", ")
      }. Install it for that harness or choose a harness that supports it.`,
    );
  }

  const nativeNames = usable.map((skill) => skill.name).join(", ");

  return [
    `Use the installed Agent Skills named: ${nativeNames}.`,
    "Load them through this harness's native skill mechanism when available. If explicit invocation is supported, invoke the skill by name. Do not treat this as inlined skill content.",
    prompt,
  ].join("\n");
}

export function assertSkillsSupportHarnesses(
  skills: Skill[],
  harnessIds: string[],
): void {
  for (const harnessId of harnessIds) {
    const unsupported = skills.filter((skill) =>
      !skillSupportsHarness(skill, harnessId)
    );

    if (unsupported.length > 0) {
      throw new Error(
        `Skill is not installed for ${harnessId}: ${
          unsupported.map((skill) => skill.id).join(", ")
        }. Install it for that harness or choose a harness that supports it.`,
      );
    }
  }
}

export async function installBundledSkills(
  input: InstallBundledSkillsInput = {},
): Promise<InstallBundledSkillsResult> {
  const dryRun = input.dryRun ?? true;
  const scope = input.scope ?? "project";

  if (scope === "project" && !input.cwd) {
    throw new Error(
      "Project skill installation requires cwd so Ennodia does not write native skill folders into the server process directory.",
    );
  }

  const harnessIds = input.harnessIds?.length
    ? [...new Set(input.harnessIds)]
    : ["codex", "claude-code", "opencode", "antigravity"];
  const skills = await loadBundledSkills(input.skillIds);
  const actions: SkillInstallAction[] = [];

  for (const skill of skills) {
    for (const target of installTargets(harnessIds, scope, input.cwd)) {
      const sourcePath = dirname(skill.path);
      const targetPath = join(target.directory, skill.name);
      const exists = existsSync(targetPath);
      const status: SkillInstallAction["status"] = exists && !input.overwrite
        ? "skipped"
        : dryRun
          ? "planned"
          : "installed";
      const action: SkillInstallAction = {
        ...target,
        skillId: skill.id,
        skillName: skill.name,
        sourcePath,
        targetPath,
        status,
        reason: exists && !input.overwrite ? "Target skill already exists." : undefined,
      };

      if (!dryRun && status === "installed") {
        await mkdir(target.directory, { recursive: true });
        await cp(sourcePath, targetPath, {
          recursive: true,
          force: input.overwrite ?? false,
          errorOnExist: !(input.overwrite ?? false),
        });
      }

      actions.push(action);
    }
  }

  return { dryRun, actions };
}

export function toSkillSummary(skill: Skill): SkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    version: skill.version,
    description: skill.description,
    hash: skill.hash,
    source: skill.source,
    path: skill.path,
    instructionsChars: skill.instructions.length,
    harnessIds: skill.harnessIds,
    native: skill.native,
    installations: skill.installations,
  };
}

export function toAppliedSkillInfo(skill: Skill): AppliedSkillInfo {
  return {
    id: skill.id,
    name: skill.name,
    version: skill.version,
    hash: skill.hash,
    source: skill.source,
    harnessIds: skill.harnessIds,
    native: skill.native,
  };
}

function getSkillDirectories(cwd?: string): SkillDirectory[] {
  const localCwd = resolve(cwd || process.cwd());
  const directories: SkillDirectory[] = [
    ...projectSkillDirectories(localCwd, ".agents/skills", ["codex", "opencode"]),
    ...projectSkillDirectories(localCwd, ".claude/skills", ["claude-code", "opencode"]),
    ...projectSkillDirectories(localCwd, ".opencode/skills", ["opencode"]),
    ...projectSkillDirectories(localCwd, ".agent/skills", ["antigravity"]),
    skillDirectory(join(homedir(), ".agents", "skills"), "user", ["codex", "opencode"]),
    skillDirectory(join(homedir(), ".claude", "skills"), "user", ["claude-code", "opencode"]),
    skillDirectory(join(homedir(), ".config", "opencode", "skills"), "user", ["opencode"]),
    skillDirectory(join(homedir(), ".gemini", "antigravity", "skills"), "user", ["antigravity"]),
    skillDirectory(join(homedir(), ".gemini", "skills"), "user", ["gemini"]),
    skillDirectory(BUNDLED_SKILLS_DIR, "builtin", ["installable"], false),
    legacySkillDirectory(join(localCwd, ".ennodia", "skills"), "project"),
    legacySkillDirectory(join(homedir(), ".ennodia", "skills"), "user"),
  ];

  const seen = new Set<string>();
  return directories.filter((directory) => {
    if (!existsSync(directory.path)) {
      return false;
    }

    const key = `${directory.format}:${directory.path}:${directory.harnessIds.join(",")}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function projectSkillDirectories(
  cwd: string,
  relativePath: string,
  harnessIds: string[],
): SkillDirectory[] {
  return ancestorDirectories(cwd).map((ancestor) =>
    skillDirectory(join(ancestor, relativePath), "project", harnessIds)
  );
}

function ancestorDirectories(cwd: string): string[] {
  const directories: string[] = [];
  let current = cwd;

  while (true) {
    directories.push(current);

    if (existsSync(join(current, ".git"))) {
      break;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return directories;
}

function skillDirectory(
  path: string,
  scope: SkillScope,
  harnessIds: string[],
  native = true,
): SkillDirectory {
  return {
    path,
    source: scope === "builtin" ? "builtin" : scope,
    scope,
    harnessIds,
    format: "agent-skill",
    native,
  };
}

function legacySkillDirectory(path: string, scope: "project" | "user"): SkillDirectory {
  return {
    path,
    source: "legacy",
    scope,
    harnessIds: ["legacy"],
    format: "legacy",
    native: false,
  };
}

async function loadAvailableSkills(cwd?: string): Promise<LoadedSkillDiscovery> {
  const directories = getSkillDirectories(cwd);
  const skillsMap = new Map<string, Skill>();
  const warnings: string[] = [];

  for (const directory of directories) {
    for (const filePath of listSkillFiles(directory)) {
      try {
        const skill = await loadSkillFromFile(
          filePath,
          directory.source,
          directory.harnessIds,
          directory.native,
        );
        const withInstallation = addInstallation(skill, directory);
        const existing = skillsMap.get(withInstallation.id);
        skillsMap.set(
          withInstallation.id,
          existing ? mergeSkills(existing, withInstallation) : withInstallation,
        );
      } catch (error) {
        warnings.push(`${filePath}: ${errorMessage(error)}`);
      }
    }
  }

  return {
    skills: [...skillsMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    searchedDirectories: directories.map((dir) => dir.path),
    warnings,
  };
}

function listSkillFiles(directory: SkillDirectory): string[] {
  const entries = readdirSync(directory.path, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory.path, entry.name);

    if (directory.format === "legacy" && entry.isFile() && isLegacySkillFile(entry.name)) {
      files.push(entryPath);
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const skillMd = join(entryPath, "SKILL.md");
    const skillJson = join(entryPath, "skill.json");

    if (existsSync(skillMd)) {
      files.push(skillMd);
    } else if (directory.format === "legacy" && existsSync(skillJson)) {
      files.push(skillJson);
    }
  }

  return files.sort();
}

async function loadBundledSkills(ids?: string[]): Promise<Skill[]> {
  const bundledDirectory = skillDirectory(BUNDLED_SKILLS_DIR, "builtin", ["installable"], false);
  const skills: Skill[] = [];

  for (const filePath of listSkillFiles(bundledDirectory)) {
    const skill = addInstallation(
      await loadSkillFromFile(filePath, "builtin", ["installable"], false),
      bundledDirectory,
    );
    skills.push(skill);
  }

  const selectedIds = ids?.length ? new Set(ids) : undefined;
  const selected = selectedIds
    ? skills.filter((skill) => selectedIds.has(skill.id))
    : skills;

  if (selectedIds && selected.length !== selectedIds.size) {
    const available = skills.map((skill) => skill.id).sort().join(", ");
    const missing = [...selectedIds].filter((id) =>
      !skills.some((skill) => skill.id === id)
    );
    throw new Error(`Bundled skill not found: ${missing.join(", ")}. Available bundled skills: ${available}`);
  }

  return selected.sort((a, b) => a.id.localeCompare(b.id));
}

function installTargets(
  harnessIds: string[],
  scope: "project" | "user",
  cwd?: string,
): SkillInstallTarget[] {
  const base = resolve(cwd || process.cwd());
  const targets: SkillInstallTarget[] = [];

  for (const harnessId of harnessIds) {
    const directory = scope === "project"
      ? projectInstallDirectory(base, harnessId)
      : userInstallDirectory(harnessId);

    if (!directory) {
      continue;
    }

    targets.push({ harnessId, scope, directory });
  }

  return targets;
}

function projectInstallDirectory(cwd: string, harnessId: string): string | undefined {
  switch (harnessId) {
    case "codex":
      return join(cwd, ".agents", "skills");
    case "claude-code":
      return join(cwd, ".claude", "skills");
    case "opencode":
      return join(cwd, ".opencode", "skills");
    case "antigravity":
      return join(cwd, ".agent", "skills");
    default:
      return undefined;
  }
}

function userInstallDirectory(harnessId: string): string | undefined {
  switch (harnessId) {
    case "codex":
      return join(homedir(), ".agents", "skills");
    case "claude-code":
      return join(homedir(), ".claude", "skills");
    case "opencode":
      return join(homedir(), ".config", "opencode", "skills");
    case "antigravity":
      return join(homedir(), ".gemini", "antigravity", "skills");
    default:
      return undefined;
  }
}

function isLegacySkillFile(fileName: string): boolean {
  const extension = extname(fileName).toLowerCase();
  return extension === ".json" || extension === ".md";
}

function addInstallation(skill: Skill, directory: SkillDirectory): Skill {
  const installation: SkillInstallation = {
    path: skill.path,
    source: directory.source,
    scope: directory.scope,
    harnessIds: directory.harnessIds,
    native: directory.native,
  };

  return {
    ...skill,
    harnessIds: [...new Set([...skill.harnessIds, ...directory.harnessIds])],
    native: skill.native || directory.native,
    installations: [installation],
  };
}

function mergeSkills(primary: Skill, secondary: Skill): Skill {
  return {
    ...primary,
    harnessIds: [...new Set([...primary.harnessIds, ...secondary.harnessIds])].sort(),
    native: primary.native || secondary.native,
    installations: [...primary.installations, ...secondary.installations],
  };
}

function parseJsonSkill(content: string, filePath: string): RawSkill {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse skill JSON: ${errorMessage(error)}`);
  }

  if (!isRecord(raw)) {
    throw new Error(`Invalid skill JSON at ${filePath}: expected an object.`);
  }

  return {
    id: stringField(raw, "id"),
    name: stringField(raw, "name"),
    version: stringField(raw, "version"),
    description: stringField(raw, "description"),
    instructions: stringField(raw, "instructions"),
  };
}

function parseMarkdownSkill(content: string, filePath: string): RawSkill {
  const parsed = splitFrontmatter(content);
  const metadata = parsed.metadata;
  const body = parsed.body.trim();
  const fallbackId = skillIdFromPath(filePath);
  const isStandardSkill = basename(filePath) === "SKILL.md";
  const skillName = isStandardSkill
    ? metadata.name
    : metadata.name ?? metadata.id ?? fallbackId;

  return {
    id: skillName,
    name: skillName,
    version: metadata.version ?? "local",
    description: isStandardSkill
      ? metadata.description
      : metadata.description ?? firstParagraph(body) ?? "Agent Skill instructions.",
    instructions: body,
  };
}

function normalizeSkill(
  raw: RawSkill,
  filePath: string,
  source: SkillSource,
  harnessIds: string[],
  native: boolean,
): Skill {
  const rawName = requireString(raw.id, "name", filePath);
  const rawDisplayName = raw.name?.trim() || rawName;
  const isStandardSkill = basename(filePath) === "SKILL.md";

  if (isStandardSkill) {
    assertNativeSkillName(rawName, filePath, "frontmatter name");
    const directoryName = basename(dirname(filePath));
    assertNativeSkillName(directoryName, filePath, "containing directory name");

    if (rawName !== directoryName) {
      throw new Error(
        `Invalid skill name in ${filePath}: frontmatter name must match the containing directory name.`,
      );
    }
  }

  const id = isStandardSkill ? rawName : toSkillId(rawName);
  const name = isStandardSkill ? rawDisplayName : toSkillId(rawDisplayName);
  const version = raw.version?.trim() || "local";
  const description = requireString(raw.description, "description", filePath);
  const instructions = normalizeInstructions(
    requireString(raw.instructions, "instructions", filePath),
    filePath,
  );

  if (!SKILL_ID_PATTERN.test(id) || !SKILL_ID_PATTERN.test(name)) {
    throw new Error(
      `Invalid skill name in ${filePath}: use lowercase letters, numbers, and single dashes.`,
    );
  }

  return {
    id,
    name,
    version,
    description,
    instructions,
    hash: hashSkill(name, version, instructions),
    source,
    path: filePath,
    harnessIds: [...new Set(harnessIds)].sort(),
    installations: [],
    native,
  };
}

function assertNativeSkillName(
  value: string,
  filePath: string,
  label: string,
): void {
  if (!SKILL_ID_PATTERN.test(value)) {
    throw new Error(
      `Invalid skill name in ${filePath}: ${label} must use lowercase letters, numbers, and single dashes.`,
    );
  }
}

function splitFrontmatter(content: string): {
  metadata: Record<string, string>;
  body: string;
} {
  const normalized = content.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    return { metadata: {}, body: normalized };
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    return { metadata: {}, body: normalized };
  }

  const metadata: Record<string, string> = {};
  const frontmatter = normalized.slice(4, end).trim();
  for (const line of frontmatter.split("\n")) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line.trim());
    if (!match) {
      continue;
    }

    metadata[match[1]] = unquote(match[2].trim());
  }

  return { metadata, body: normalized.slice(end + 5) };
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function requireString(
  value: string | undefined,
  field: string,
  filePath: string,
): string {
  if (!value || !value.trim()) {
    throw new Error(`Invalid skill: missing or non-string '${field}' in ${filePath}`);
  }

  return value.trim();
}

function normalizeInstructions(instructions: string, filePath: string): string {
  const normalized = instructions.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    throw new Error(`Invalid skill: empty instructions in ${filePath}`);
  }

  if (normalized.length > MAX_SKILL_INSTRUCTIONS_CHARS) {
    throw new Error(
      `Invalid skill: instructions exceed ${MAX_SKILL_INSTRUCTIONS_CHARS} characters in ${filePath}`,
    );
  }

  return normalized;
}

function hashSkill(name: string, version: string, instructions: string): string {
  return createHash("sha256")
    .update(`${name}\n${version}\n${instructions}`)
    .digest("hex");
}

function skillIdFromPath(filePath: string): string {
  const name = basename(filePath) === "SKILL.md"
    ? basename(dirname(filePath))
    : basename(filePath, extname(filePath));

  return toSkillId(name) || "skill";
}

function toSkillId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function firstParagraph(content: string): string | undefined {
  const paragraph = content
    .split(/\n{2,}/)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate && !candidate.startsWith("#"));

  return paragraph
    ?.replace(/\s+/g, " ")
    .slice(0, 180);
}

function skillSupportsHarness(skill: Skill, harnessId: string): boolean {
  return (
    skill.harnessIds.includes(harnessId) ||
    skill.harnessIds.includes("legacy")
  );
}

function unquote(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
