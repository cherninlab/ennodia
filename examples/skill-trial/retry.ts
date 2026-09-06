// Deliberately incomplete implementation for a review exercise.
export function retryDelaySeconds(value: string | null): number {
  return Number(value) || 30;
}
