import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ENNODIA_VERSION } from "../version";

const client = new Client({
  name: "ennodia-smoke",
  version: ENNODIA_VERSION,
});

const transport = new StdioClientTransport({
  command: "bun",
  args: ["run", "src/cli.ts"],
  cwd: process.cwd(),
  stderr: "pipe",
});

await client.connect(transport);

const tools = await client.listTools();
const harnesses = await client.callTool({
  name: "ennodia_list_harnesses",
  arguments: {},
});
const plan = await client.callTool({
  name: "ennodia_plan",
  arguments: {
    prompt: "Review this TypeScript repo and compare tradeoffs.",
  },
});
const budget = await client.callTool({
  name: "ennodia_estimate_budget",
  arguments: {
    prompt: "Review this TypeScript repo and compare tradeoffs.",
    mode: "parallel",
    compare: true,
    budget: {
      maxChildTasks: 10,
    },
  },
});
const skills = await client.callTool({
  name: "ennodia_list_skills",
  arguments: {},
});
const skillInstall = await client.callTool({
  name: "ennodia_install_skills",
  arguments: {
    dryRun: true,
    harnessIds: ["codex"],
    cwd: process.cwd(),
  },
});

await client.close();

const skillList = parseTextResult(skills);
const skillInstallPlan = parseTextResult(skillInstall);

const toolNames = tools.tools.map((tool) => tool.name);
const harnessList = parseTextResult(harnesses);
const routePlan = parseTextResult(plan);
const budgetPlan = parseTextResult(budget);

assertToolSchemaDescriptions(tools.tools);
assertIncludes(toolNames, "ennodia_list_harnesses");
assertIncludes(toolNames, "ennodia_plan");
assertIncludes(toolNames, "ennodia_estimate_budget");
assertIncludes(toolNames, "ennodia_start");
assertIncludes(toolNames, "ennodia_run");
assertIncludes(toolNames, "ennodia_list_runs");
assertIncludes(toolNames, "ennodia_get_run");
assertIncludes(toolNames, "ennodia_cancel_run");
assertIncludes(toolNames, "ennodia_get_task");
assertIncludes(toolNames, "ennodia_start_compare");
assertIncludes(toolNames, "ennodia_get_compare");
assertIncludes(toolNames, "ennodia_list_skills");
assertIncludes(toolNames, "ennodia_install_skills");

if (!Array.isArray(harnessList)) {
  throw new Error("Harness list response was not an array.");
}

if (!isSkillDiscovery(skillList)) {
  throw new Error("Skills list response did not include the expected discovery shape.");
}

if (!isSkillInstallPlan(skillInstallPlan)) {
  throw new Error("Skills install response did not include the expected plan shape.");
}

if (!isRoutePlanSummary(routePlan)) {
  throw new Error("Plan response did not include the expected route shape.");
}

if (!isBudgetPlan(budgetPlan)) {
  throw new Error("Budget response did not include the expected estimate shape.");
}

console.log(
  JSON.stringify(
    {
      tools: toolNames,
      harnesses: harnessList.filter(isHarnessSummary).map((harness) => ({
        id: harness.id,
        runnable: harness.runnable,
        version: harness.version,
      })),
      skills: skillList.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        version: skill.version,
        source: skill.source,
        native: skill.native,
      })),
      skillInstallActions: skillInstallPlan.actions.length,
      selected: routePlan.selected ?? null,
      parallelSuggested: routePlan.parallelSuggested,
      compareSuggested: routePlan.compareSuggested,
      budgetEstimate: budgetPlan.budget.estimate.estimatedTotalInputTokens,
    },
    null,
    2,
  ),
);

type McpTextContent = {
  type: "text";
  text: string;
};

type HarnessSummary = {
  id: string;
  runnable: boolean;
  version?: string;
};

type RoutePlanSummary = {
  category: string;
  candidates: string[];
  selected?: string;
  parallelSuggested: boolean;
  compareSuggested: boolean;
};

type SkillDiscoverySummary = {
  skills: SkillSummary[];
  warnings: string[];
  searchedDirectories: string[];
};

type SkillSummary = {
  id: string;
  name: string;
  version: string;
  source: string;
  native: boolean;
};

type SkillInstallPlan = {
  dryRun: boolean;
  actions: unknown[];
};

type BudgetPlan = {
  budget: {
    estimate: {
      estimatedTotalInputTokens: number;
    };
    exceeded: boolean;
    issues: string[];
  };
};

type JsonSchemaObject = {
  description?: unknown;
  properties?: unknown;
  items?: unknown;
};

function parseTextResult(result: unknown): unknown {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    throw new Error("MCP response did not include content.");
  }

  const text = content
    .filter(isMcpTextContent)
    .map((item) => item.text)
    .join("\n");

  return JSON.parse(text);
}

function assertIncludes(values: string[], expected: string): void {
  if (!values.includes(expected)) {
    throw new Error(`Expected MCP tools to include ${expected}.`);
  }
}

function assertToolSchemaDescriptions(tools: unknown[]): void {
  for (const tool of tools) {
    if (!isRecord(tool) || typeof tool.name !== "string") {
      throw new Error("MCP tool list returned an invalid tool entry.");
    }

    if (typeof tool.description !== "string" || !tool.description.trim()) {
      throw new Error(`${tool.name} is missing a tool description.`);
    }

    assertInputPropertyDescriptions(tool.name, tool.inputSchema);
  }
}

function assertInputPropertyDescriptions(toolName: string, schema: unknown): void {
  if (!isRecord(schema)) {
    throw new Error(`${toolName} is missing an input schema.`);
  }

  assertSchemaPropertiesHaveDescriptions(toolName, schema);
}

function assertSchemaPropertiesHaveDescriptions(
  context: string,
  schema: JsonSchemaObject,
): void {
  if (isRecord(schema.properties)) {
    for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
      if (!isRecord(propertySchema)) {
        throw new Error(`${context}.${propertyName} has an invalid schema.`);
      }

      if (
        typeof propertySchema.description !== "string" ||
        !propertySchema.description.trim()
      ) {
        throw new Error(`${context}.${propertyName} is missing a description.`);
      }

      assertSchemaPropertiesHaveDescriptions(propertyName, propertySchema);
    }
  }

  if (isRecord(schema.items)) {
    assertSchemaPropertiesHaveDescriptions(`${context}[]`, schema.items);
  }
}

function isMcpTextContent(value: unknown): value is McpTextContent {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "text" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

function isHarnessSummary(value: unknown): value is HarnessSummary {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { runnable?: unknown }).runnable === "boolean"
  );
}

function isRoutePlanSummary(value: unknown): value is RoutePlanSummary {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { category?: unknown }).category === "string" &&
    Array.isArray((value as { candidates?: unknown }).candidates) &&
    typeof (value as { parallelSuggested?: unknown }).parallelSuggested ===
      "boolean" &&
    typeof (value as { compareSuggested?: unknown }).compareSuggested === "boolean"
  );
}

function isSkillDiscovery(value: unknown): value is SkillDiscoverySummary {
  return (
    isRecord(value) &&
    Array.isArray(value.skills) &&
    Array.isArray(value.warnings) &&
    Array.isArray(value.searchedDirectories)
  );
}

function isSkillInstallPlan(value: unknown): value is SkillInstallPlan {
  return (
    isRecord(value) &&
    typeof value.dryRun === "boolean" &&
    Array.isArray(value.actions)
  );
}

function isBudgetPlan(value: unknown): value is BudgetPlan {
  if (!isRecord(value) || !isRecord(value.budget)) {
    return false;
  }

  const budget = value.budget;
  return (
    isRecord(budget.estimate) &&
    typeof budget.estimate.estimatedTotalInputTokens === "number" &&
    typeof budget.exceeded === "boolean" &&
    Array.isArray(budget.issues)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
