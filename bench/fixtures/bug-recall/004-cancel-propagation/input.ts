type Task = {
  id: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  cancel(): void;
};

type Run = {
  id: string;
  status: "running" | "cancelled";
  taskIds: string[];
};

export function cancelRun(run: Run, tasks: Map<string, Task>): Run {
  if (run.status !== "running") {
    return run;
  }

  run.status = "cancelled";

  for (const taskId of run.taskIds) {
    const task = tasks.get(taskId);
    if (!task || task.status !== "running") {
      continue;
    }
  }

  return run;
}
