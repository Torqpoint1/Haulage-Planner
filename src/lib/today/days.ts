/** The date `n` working days (Monday to Friday) after `iso`. Weekends don't count. */
export function addWorkingDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}
