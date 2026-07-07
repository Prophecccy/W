/**
 * Returns today's date in YYYY-MM-DD format based on the user's timezone.
 * TODO: Integrate user timezone preferences.
 */
export function getToday(customDate?: Date, resetTimeOverride?: string): string {
  const d = customDate || new Date();
  const resetTime = resetTimeOverride || (typeof localStorage !== 'undefined'
    ? localStorage.getItem("w_daily_reset_time") || "04:00"
    : "04:00");
  
  if (isBeforeResetTime(d, resetTime)) {
    const adjusted = new Date(d.getTime());
    adjusted.setDate(d.getDate() - 1);
    return formatDate(adjusted);
  }
  
  return formatDate(d);
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
 * Adds N days to a given YYYY-MM-DD string and returns a new string.
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
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

/**
 * Calculates milliseconds remaining until the next daily reset time.
 */
export function getMsUntilReset(dailyResetTime: string, now: Date = new Date()): number {
  const [resetH, resetM] = dailyResetTime.split(":").map(Number);
  const resetDate = new Date(now);
  resetDate.setHours(resetH, resetM, 0, 0);
  if (now.getTime() >= resetDate.getTime()) {
    resetDate.setDate(resetDate.getDate() + 1);
  }
  return Math.max(0, resetDate.getTime() - now.getTime());
}

/**
 * Calculates milliseconds remaining until exactly 5 minutes before the next daily reset time.
 */
export function getMsUntilBackup(dailyResetTime: string, now: Date = new Date()): number {
  const [resetH, resetM] = dailyResetTime.split(":").map(Number);
  const resetDate = new Date(now);
  resetDate.setHours(resetH, resetM, 0, 0);
  
  // Calculate next reset date (standard boundary)
  if (now.getTime() >= resetDate.getTime()) {
    resetDate.setDate(resetDate.getDate() + 1);
  }

  // Backup target time is exactly 5 minutes before resetDate
  const backupDate = new Date(resetDate.getTime() - 5 * 60 * 1000);
  
  // If we are already past this cycle's backup window, push to the next day's backup time
  if (now.getTime() >= backupDate.getTime()) {
    backupDate.setDate(backupDate.getDate() + 1);
  }

  return Math.max(0, backupDate.getTime() - now.getTime());
}

export function getWeekStart(dateStr: string, weekStartDay: number): string {
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr;
  let safety = 0;
  while (d.getDay() !== weekStartDay && safety < 10) {
    d.setDate(d.getDate() - 1);
    safety++;
  }
  return formatDate(d);
}

export function getMonthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

export function getIntervalStart(habit: { period: string; intervalDays?: number; startDate?: string; createdAt: any }, todayStr: string): string {
  if (habit.period !== "interval" || !habit.intervalDays || habit.intervalDays <= 0) return todayStr;
  const baseDate = habit.startDate ? new Date(habit.startDate + "T12:00:00") : new Date(habit.createdAt);
  baseDate.setHours(12, 0, 0, 0); // Normalize to noon to match today comparison
  const today = new Date(todayStr + "T12:00:00");
  const diffDays = Math.floor((today.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return formatDate(baseDate);
  const segmentStart = diffDays - (diffDays % habit.intervalDays);
  baseDate.setDate(baseDate.getDate() + segmentStart);
  return formatDate(baseDate);
}

export function getPeriodStart(habit: { period: string; intervalDays?: number; startDate?: string; createdAt: any }, todayStr: string, weekStartDay: number): string {
  if (habit.period === "weekly") return getWeekStart(todayStr, weekStartDay);
  if (habit.period === "monthly") return getMonthStart(todayStr);
  if (habit.period === "interval") return getIntervalStart(habit, todayStr);
  return todayStr;
}

export function isMultiDayMetric(habit: { type: string; period: string }): boolean {
  return (habit.type === "metric" || habit.type === "limiter") && (habit.period === "weekly" || habit.period === "monthly" || habit.period === "interval");
}

