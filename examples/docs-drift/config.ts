export const DEFAULT_PORT = 4545;
export function readPort(env: Record<string, string | undefined>): number {
  const value = env.APP_PORT;
  return value === undefined ? DEFAULT_PORT : Number(value);
}
export function readiness(): { ready: boolean } {
  return { ready: true };
}
