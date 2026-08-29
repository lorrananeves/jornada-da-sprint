/**
 * reactions.js — proteção client-side contra reações/votos duplicados
 *
 * Guarda no localStorage um conjunto de chaves únicas no formato:
 *   `${sessionId}:${colName}:${itemId}:${deviceId}:${reactionKey}`
 *
 * Antes de enviar uma reação, o chamador verifica se ela já foi registrada.
 * Isso é uma defesa de UX (não um controle de segurança absoluto — as Firestore
 * Rules devem ser o guardião real).
 *
 * Cache em memória: o Set é carregado do localStorage apenas uma vez e mantido
 * em `_cache`. Todas as operações de leitura/escrita usam o cache, evitando
 * parse/serialize a cada reação e eliminando race conditions entre chamadas
 * síncronas consecutivas (bug #08).
 */

const STORAGE_KEY = '_jornada_reactions';
const MAX_ENTRIES = 5000; // evita crescimento ilimitado do localStorage

/** Cache em memória — null antes da primeira leitura */
let _cache = null;

function _getCache() {
  if (_cache !== null) return _cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _cache = raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    _cache = new Set();
  }
  return _cache;
}

function _persist() {
  try {
    const entries = [..._cache];
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
  return _getCache().has(key);
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
  _getCache().add(key);
  _persist();
}

/**
 * Desfaz o registro de uma reação (rollback após falha no Firestore).
 * @param {string} sessionId
 * @param {string} colName
 * @param {string} itemId
 * @param {string} deviceId
 * @param {string} reactionKey
 */
export function unmarkReacted(sessionId, colName, itemId, deviceId, reactionKey) {
  const key = `${sessionId}:${colName}:${itemId}:${deviceId}:${reactionKey}`;
  _getCache().delete(key);
  _persist();
}

/**
 * Invalida o cache em memória, forçando releitura do localStorage na próxima
 * operação. Deve ser chamado ao iniciar ou resetar uma sessão para que entradas
 * da sessão anterior não ocupem memória indefinidamente.
 * As chaves incluem o sessionId, então hasReacted() nunca produz falso positivo
 * entre sessões — mas sem esta limpeza o cache cresce sem limite na mesma aba.
 */
export function clearReactionsCache() {
  _cache = null;
}
