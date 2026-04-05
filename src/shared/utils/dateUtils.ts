/**
 * Returns today's date in YYYY-MM-DD format based on the user's timezone.
 * TODO: Integrate user timezone preferences.
 */
export function getToday(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a given Date object to YYYY-MM-DD.
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Subtracts N days from a given YYYY-MM-DD string and returns a new string.
 */
export function subtractDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

/**
 * Given a reset time like '04:00', determines if the current time is before the reset boundary.
 */
export function isBeforeResetTime(date: Date, resetTime: string): boolean {
  const [resetHour, resetMinute] = resetTime.split(':').map(Number);
  const hour = date.getHours();
  const minute = date.getMinutes();
  
  if (hour < resetHour) return true;
  if (hour === resetHour && minute < resetMinute) return true;
  return false;
}
