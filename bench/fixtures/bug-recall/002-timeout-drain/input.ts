type ChildProcess = {
  stdout: AsyncIterable<Uint8Array>;
  stderr: AsyncIterable<Uint8Array>;
  exited: Promise<number>;
  kill(): void;
};

type Result = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const decoder = new TextDecoder();

export async function collectChild(
  child: ChildProcess,
  timeoutMs: number,
): Promise<Result> {
  let stdout = "";
  let stderr = "";

  void (async () => {
    for await (const chunk of child.stdout) {
      stdout += decoder.decode(chunk);
    }
  })();

  void (async () => {
    for await (const chunk of child.stderr) {
      stderr += decoder.decode(chunk);
    }
  })();

  const timeout = setTimeout(() => child.kill(), timeoutMs);
  const exitCode = await child.exited;
  clearTimeout(timeout);

  return { exitCode, stdout, stderr };
}
