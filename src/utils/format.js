/**
 * Formatting Utilities
 */

/**
 * Format a date string (YYYY-MM-DD or ISO timestamp) to localised Brazilian format.
 * Trunca para os primeiros 10 caracteres antes do split para que strings ISO
 * completas (ex: "2024-01-15T10:00:00Z") não incluam a parte de tempo no campo do dia.
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [year, month, day] = String(dateStr).slice(0, 10).split('-');
  if (!year || !month || !day) return '—';
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

// ── Tipos de nota de discussão ────────────────────────────────────────────────

export const DISCUSSION_TYPES = [
  { id: 'insight',     emoji: '💡', label: 'Insight' },
  { id: 'mitigation', emoji: '🛡️', label: 'Mitigação existente' },
  { id: 'agreement',  emoji: '🤝', label: 'Acordo do time' },
  { id: 'action',     emoji: '🚀', label: 'Ação' },
  { id: 'observation',emoji: '📌', label: 'Observação' },
];

/**
 * Retorna o emoji do tipo de nota de discussão.
 */
export function getDiscussionTypeEmoji(type) {
  return DISCUSSION_TYPES.find((t) => t.id === type)?.emoji ?? '📝';
}

/**
 * Retorna o label do tipo de nota de discussão.
 */
export function getDiscussionTypeLabel(type) {
  return DISCUSSION_TYPES.find((t) => t.id === type)?.label ?? type;
}
