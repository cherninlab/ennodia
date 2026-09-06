/** Signal the POSIX process group created with detached: true. Descendants
 * that explicitly leave that group are outside this ownership boundary. */
export function signalOwnedProcess(
  child: Pick<Bun.Subprocess, "pid" | "kill" | "exitCode">,
  signal: "SIGTERM" | "SIGKILL",
  ownsGroup = process.platform !== "win32",
): void {
  if (ownsGroup) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      return;
    }
  }
  if (typeof child.exitCode !== "number") child.kill(signal);
}
