import type { HarnessAdapter, HarnessDiscovery } from "../harnesses";
import { TaskManager } from "../tasks";

const adapter: HarnessAdapter = {
  id: "echo-agent",
  name: "Echo Agent",
  kind: "cli",
  commandCandidates: ["sh"],
  capabilities: ["smoke-test"],
  buildCommand: (commandPath, input) => ({
    command: commandPath,
    args: [
      "-c",
      "printf 'stdout:%s\\n' \"$1\"; printf 'stderr:trace\\n' >&2",
      "echo-agent",
      input.prompt,
    ],
  }),
};

const discovery: HarnessDiscovery = {
  id: adapter.id,
  name: adapter.name,
  kind: adapter.kind,
  available: true,
  runnable: true,
  commandPath: "/bin/sh",
  capabilities: adapter.capabilities,
  notes: [],
};

const tasks = new TaskManager();
const { task } = tasks.start(adapter, discovery, {
  prompt: "hello",
  timeoutMs: 5_000,
});

let result = tasks.get(task.id);
while (result?.status === "running") {
  await Bun.sleep(50);
  result = tasks.get(task.id);
}

console.log(JSON.stringify(result, null, 2));
