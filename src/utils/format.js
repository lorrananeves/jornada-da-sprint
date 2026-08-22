/**
 * Formatting Utilities
 */

/**
 * Format a date string (YYYY-MM-DD) to localised Brazilian format
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Format an ISO timestamp to Brazilian date
 */
export function formatISO(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format a number with thousands separator
 */
export function formatNumber(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString('pt-BR');
}

/**
 * Format XP value
 */
export function formatXP(xp) {
  return `${formatNumber(xp)} XP`;
}

/**
 * Truncate a string to maxLen, appending ellipsis
 */
export function truncate(str, maxLen = 80) {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen) + '…';
}

/**
 * Get label for a numeric score (1-5)
 */
export const SCORE_LABELS = {
  1: '😫',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '🤩',
};

export function getScoreEmoji(score) {
  return SCORE_LABELS[score] || '❓';
}

export function getScoreLabel(score) {
  const labels = {
    1: 'Muito ruim',
    2: 'Ruim',
    3: 'Neutro',
    4: 'Bom',
    5: 'Excelente',
  };
  return labels[score] || '';
}

/**
 * Get label for a priority
 */
export function getPriorityLabel(priority) {
  const labels = { high: 'Alta', medium: 'Média', low: 'Baixa' };
  return labels[priority] || priority;
}

/**
 * Get label for a strategy
 */
export function getStrategyLabel(strategy) {
  const labels = {
    prevent: '🛡️ Prevenir',
    reduce: '🧪 Reduzir Impacto',
    handle: '🤝 Lidar Melhor',
  };
  return labels[strategy] || strategy;
}
