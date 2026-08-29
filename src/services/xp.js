/**
 * XP Rules Service
 */

export const XP_RULES = {
  CHECKIN: 10,
  TREASURE: 10,
  RECOGNITION: 10,
  LEARNING: 10,
  MONSTER: 10,
  SOLUTION: 20,
  MISSION: 30,
  MONSTER_VOTE: 5,
};

/**
 * Get XP reward for completing the check-in phase
 */
export function xpForCheckin() {
  return XP_RULES.CHECKIN;
}

/**
 * Get XP for adding a treasure card based on its category
 */
export function xpForTreasure(category) {
  const map = {
    treasure: XP_RULES.TREASURE,
    recognition: XP_RULES.RECOGNITION,
    learning: XP_RULES.LEARNING,
  };
  return map[category] ?? XP_RULES.TREASURE;
}

/**
 * Get XP for adding a monster
 */
export function xpForMonster() {
  return XP_RULES.MONSTER;
}

/**
 * Get XP for adding a solution
 */
export function xpForSolution() {
  return XP_RULES.SOLUTION;
}

/**
 * Get XP for creating a mission
 */
export function xpForMission() {
  return XP_RULES.MISSION;
}

/**
 * Get XP for voting on a monster during the voting phase.
 * Notas de discussão do SM não geram XP.
 */
export function xpForMonsterVote() {
  return XP_RULES.MONSTER_VOTE;
}
