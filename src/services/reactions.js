/**
 * reactions.js — proteção client-side contra reações/votos duplicados
 *
 * Guarda no localStorage um conjunto de chaves únicas no formato:
 *   `${sessionId}:${colName}:${itemId}:${deviceId}:${reactionKey}`
 *
 * Antes de enviar uma reação, o chamador verifica se ela já foi registrada.
 * Isso é uma defesa de UX (não um controle de segurança absoluto — as Firestore
 * Rules devem ser o guardião real).
 */

const STORAGE_KEY = '_jornada_reactions';
const MAX_ENTRIES = 5000; // evita crescimento ilimitado do localStorage

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function _save(set) {
  try {
    // Mantém apenas as últimas MAX_ENTRIES entradas para não acumular indefinidamente
    const entries = [...set];
    const trimmed = entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage cheio — ignora silenciosamente
  }
}

/**
 * Verifica se o dispositivo já enviou esta reação nesta sessão.
 * @param {string} sessionId
 * @param {string} colName   — 'treasures' | 'monsters' | 'solutions'
 * @param {string} itemId
 * @param {string} deviceId
 * @param {string} reactionKey — ex: 'fire', 'heart', 'vote'
 * @returns {boolean} true se já foi enviado antes
 */
export function hasReacted(sessionId, colName, itemId, deviceId, reactionKey) {
  const key = `${sessionId}:${colName}:${itemId}:${deviceId}:${reactionKey}`;
  return _load().has(key);
}

/**
 * Registra que o dispositivo enviou esta reação.
 * @param {string} sessionId
 * @param {string} colName
 * @param {string} itemId
 * @param {string} deviceId
 * @param {string} reactionKey
 */
export function markReacted(sessionId, colName, itemId, deviceId, reactionKey) {
  const key = `${sessionId}:${colName}:${itemId}:${deviceId}:${reactionKey}`;
  const set = _load();
  set.add(key);
  _save(set);
}
