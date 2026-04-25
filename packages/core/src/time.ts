/**
 * Returns the current local date and time formatted for use in agent prompts.
 * Local-TZ formatting: prompt context should reflect the operator's wall clock.
 * Metrics file naming stays UTC-based (see metrics.ts) for cross-machine consistency.
 */
export function getTodayAndTime(): { today: string; time: string } {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return { today, time };
}

/**
 * Returns a filename-safe timestamp string like "20260419-143022".
 * Used for log file naming so multiple runs in the same day do not collide.
 */
export function makeRunId(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    String(d.getFullYear()) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}
