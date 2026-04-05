// ─── Level thresholds (doubling progression) ─────────────────────
// Level 0 = starting. Level 10 = max.
// Each level requires completing (threshold) total times.

export interface LevelThreshold {
  level: number;
  minCompletions: number; // completions needed to reach this level
  label: string;
}

const LEVEL_TABLE: LevelThreshold[] = [
  { level: 0, minCompletions: 0, label: "Nil" },
  { level: 1, minCompletions: 5, label: "Novice" },
  { level: 2, minCompletions: 15, label: "Apprentice" },
  { level: 3, minCompletions: 30, label: "Adept" },
  { level: 4, minCompletions: 60, label: "Skilled" },
  { level: 5, minCompletions: 100, label: "Expert" },
  { level: 6, minCompletions: 175, label: "Master" },
  { level: 7, minCompletions: 300, label: "Elite" },
  { level: 8, minCompletions: 500, label: "Legend" },
  { level: 9, minCompletions: 750, label: "Mythic" },
  { level: 10, minCompletions: 1000, label: "Apex" },
];

export interface LevelInfo {
  level: number;
  label: string;
  progress: number; // completions accumulated in current level
  nextThreshold: number; // completions needed to reach next level from zero
  progressPercent: number; // 0–100 for the progress bar
}

// ─── calculateLevel ───────────────────────────────────────────────

/**
 * Given total habit completions, returns the current level, progress toward
 * next level, and thresholds for rendering a progress bar.
 */
export function calculateLevel(totalCompletions: number): LevelInfo {
  let currentLevel = LEVEL_TABLE[0];
  let nextLevel = LEVEL_TABLE[1];

  for (let i = LEVEL_TABLE.length - 1; i >= 0; i--) {
    if (totalCompletions >= LEVEL_TABLE[i].minCompletions) {
      currentLevel = LEVEL_TABLE[i];
      nextLevel = LEVEL_TABLE[Math.min(i + 1, LEVEL_TABLE.length - 1)];
      break;
    }
  }

  // At max level
  if (currentLevel.level === 10) {
    return {
      level: 10,
      label: currentLevel.label,
      progress: totalCompletions - currentLevel.minCompletions,
      nextThreshold: 0,
      progressPercent: 100,
    };
  }

  const levelBase = currentLevel.minCompletions;
  const levelCap = nextLevel.minCompletions;
  const progress = totalCompletions - levelBase;
  const span = levelCap - levelBase;
  const progressPercent = Math.min(100, Math.round((progress / span) * 100));

  return {
    level: currentLevel.level,
    label: currentLevel.label,
    progress,
    nextThreshold: span,
    progressPercent,
  };
}

// ─── getLevelThresholds ───────────────────────────────────────────

/** Returns the full level table for display in settings or analytics. */
export function getLevelThresholds(): LevelThreshold[] {
  return LEVEL_TABLE;
}
