/**
 * Statistics Service
 */

/**
 * Calculate check-in distribution and average from checkins array
 * @param {Array<{score: number, comment: string|null}>} checkins
 */
export function calcCheckinStats(checkins) {
  const total = checkins.length;
  if (!total) return { distribution: {}, average: 0, total: 0 };

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;

  for (const c of checkins) {
    distribution[c.score] = (distribution[c.score] || 0) + 1;
    sum += c.score;
  }

  return {
    distribution,
    average: sum / total,
    total,
  };
}

/**
 * Get the mood label from average score
 */
export function getMoodLabel(avg) {
  if (avg >= 4.5) return { label: 'Excelente 🤩', color: 'var(--success)' };
  if (avg >= 3.5) return { label: 'Bom 🙂', color: 'var(--success)' };
  if (avg >= 2.5) return { label: 'Neutro 😐', color: 'var(--accent)' };
  if (avg >= 1.5) return { label: 'Ruim 😕', color: 'var(--danger)' };
  return { label: 'Muito Ruim 😫', color: 'var(--danger)' };
}

/**
 * Summarise all retrospective data for the complete/report screens
 * @param {object} state
 */
export function calcSummaryStats(state) {
  const treasureCount = state.treasures.filter((t) => t.category === 'treasure').length;
  const recognitionCount = state.treasures.filter((t) => t.category === 'recognition').length;
  const learningCount = state.treasures.filter((t) => t.category === 'learning').length;
  const monsterCount = state.monsters.length;
  const selectedMonsterCount = state.monsters.filter((m) => m.selected).length;
  const solutionCount = state.solutions.length;
  const missionCount = state.missions.length;
  const checkinStats = calcCheckinStats(state.checkins);

  const highPriority = state.missions.filter((m) => m.priority === 'high').length;
  const medPriority = state.missions.filter((m) => m.priority === 'medium').length;
  const lowPriority = state.missions.filter((m) => m.priority === 'low').length;

  return {
    treasureCount,
    recognitionCount,
    learningCount,
    monsterCount,
    selectedMonsterCount,
    solutionCount,
    missionCount,
    checkinStats,
    highPriority,
    medPriority,
    lowPriority,
    totalXP: state.xp,
  };
}
