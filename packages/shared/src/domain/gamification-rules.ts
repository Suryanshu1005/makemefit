export class GamificationEngine {
  /**
   * Cumulative XP threshold required to reach level L:
   * Level 1: 0 XP
   * Level L: Math.floor(100 * (L - 1) ^ 1.5)
   */
  static xpRequiredForLevel(level: number): number {
    if (level <= 1) return 0;
    return Math.floor(100 * Math.pow(level - 1, 1.5));
  }

  /**
   * Derives current level from total accumulated XP
   */
  static calculateLevel(totalXp: number): number {
    if (totalXp <= 0) return 1;
    let level = 1;
    while (GamificationEngine.xpRequiredForLevel(level + 1) <= totalXp) {
      level++;
    }
    return level;
  }

  /**
   * Returns progress details within the current level
   */
  static calculateLevelProgress(totalXp: number) {
    const currentLevel = GamificationEngine.calculateLevel(totalXp);
    const currentLevelFloor = GamificationEngine.xpRequiredForLevel(currentLevel);
    const nextLevelCeiling = GamificationEngine.xpRequiredForLevel(currentLevel + 1);

    const xpInCurrentLevel = totalXp - currentLevelFloor;
    const xpSpanForLevel = nextLevelCeiling - currentLevelFloor;
    const progressPercent = Math.min(100, Math.round((xpInCurrentLevel / xpSpanForLevel) * 100));

    return {
      currentLevel,
      totalXp,
      currentLevelFloor,
      nextLevelCeiling,
      xpInCurrentLevel,
      xpSpanForLevel,
      progressPercent,
    };
  }

  /**
   * Evaluates streak increment or reset based on calendar date difference
   */
  static evaluateStreak(
    lastLoggedDate: string | null | undefined,
    mealLogDate: string,
    currentStreak: number,
    longestStreak: number
  ) {
    if (!lastLoggedDate) {
      return {
        newStreak: 1,
        newLongestStreak: Math.max(longestStreak, 1),
        isFirstMealToday: true,
      };
    }

    if (lastLoggedDate === mealLogDate) {
      // Already logged a meal on this date
      return {
        newStreak: currentStreak,
        newLongestStreak: longestStreak,
        isFirstMealToday: false,
      };
    }

    const last = new Date(lastLoggedDate);
    const current = new Date(mealLogDate);
    const diffTime = current.getTime() - last.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

    let newStreak = 1;
    if (diffDays === 1) {
      newStreak = currentStreak + 1;
    } else {
      // Gap > 1 day: Streak broken
      newStreak = 1;
    }

    return {
      newStreak,
      newLongestStreak: Math.max(longestStreak, newStreak),
      isFirstMealToday: true,
    };
  }
}
