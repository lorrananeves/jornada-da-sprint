/**
 * Collections — funções de escrita para subcoleções Firestore
 *
 * Cada função recebe o contexto necessário (sessionId, state) via
 * getters para evitar acoplamento circular com session.js.
 */

import {
  saveItem,
  patchItem,
  removeItem,
  batchWrite,
  castVote,
  castReaction,
  castMonsterVote,
} from '../../services/firebase.js';

// ── Checkins ──────────────────────────────────────────────────────────────────

export function addCheckin(sessionId, checkin) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  return saveItem(sessionId, 'checkins', checkin);
}

// ── Treasures ─────────────────────────────────────────────────────────────────

export function addTreasure(sessionId, treasure) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  return saveItem(sessionId, 'treasures', treasure);
}

export function reactToTreasure(sessionId, id, reaction, deviceId) {
  if (!sessionId) return;
  return castReaction(sessionId, 'treasures', id, deviceId, reaction);
}

// ── Monsters ──────────────────────────────────────────────────────────────────

export function addMonster(sessionId, monster) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  return saveItem(sessionId, 'monsters', monster);
}

export function reactToMonster(sessionId, id, reaction, deviceId) {
  if (!sessionId) return;
  return castReaction(sessionId, 'monsters', id, deviceId, reaction);
}

export function selectMonster(sessionId, monsters, id) {
  if (!sessionId) return;
  const monster = monsters.find((m) => m.id === id);
  if (!monster) return;
  patchItem(sessionId, 'monsters', id, { selected: !monster.selected }).catch((e) =>
    console.warn('Firestore selectMonster failed:', e)
  );
}

export function renameMonster(sessionId, id, newText) {
  if (!sessionId || !id || !newText?.trim()) return;
  return patchItem(sessionId, 'monsters', id, { text: newText.trim() });
}

export function deleteMonster(sessionId, id) {
  if (!sessionId || !id) return;
  // Marcar como deletado em vez de removeItem — Rules não permitem delete em /monsters.
  // unmerged=false garante que não seja confundido com unmerge.
  return patchItem(sessionId, 'monsters', id, { merged: true, mergedInto: '__deleted__' });
}

export function mergeMonsters(sessionId, monsters, keepId, dropId, newText, notifyFn) {
  if (!sessionId) return;
  const keep = monsters.find((m) => m.id === keepId);
  const drop = monsters.find((m) => m.id === dropId);
  if (!keep || !drop) return;

  const mergedFrom = [...(keep.mergedFrom || [keep.id]), drop.id];
  const keepUpdate = {
    ...(newText && newText !== keep.text ? { text: newText } : {}),
    reactions: {
      fire: (keep.reactions?.fire || 0) + (drop.reactions?.fire || 0),
      eyes: (keep.reactions?.eyes || 0) + (drop.reactions?.eyes || 0),
      bulb: (keep.reactions?.bulb || 0) + (drop.reactions?.bulb || 0),
    },
    selected: keep.selected || drop.selected,
    mergedFrom,
  };

  // Batch write atômico: update do keep + marcação de inativo no drop.
  // Não usamos delete porque as Rules bloqueiam delete em /monsters.
  // Marcar merged=true + mergedInto preserva histórico e é auditável.
  const dropUpdate = {
    merged: true,
    mergedInto: keepId,
  };

  batchWrite(sessionId, [
    { type: 'update', colName: 'monsters', itemId: keepId, data: keepUpdate },
    { type: 'update', colName: 'monsters', itemId: dropId, data: dropUpdate },
  ]).catch((e) => console.warn('Firestore mergeMonsters batch failed:', e));

  // Optimistic local: remove o drop da lista (ele ficará inativo no Firestore)
  notifyFn(
    monsters
      .filter((m) => m.id !== dropId)
      .map((m) => (m.id === keepId ? { ...m, ...keepUpdate } : m))
  );
}

/**
 * Desfaz o merge de um monstro agrupado.
 *
 * Dado M com mergedFrom: [A.id, B.id, ...]:
 *   - M é marcado como unmerged=true (desaparece da lista ativa via sortCollection)
 *   - A, B, ... têm merged=false e mergedInto=null restaurados (voltam ativos)
 *
 * Notas de discussão vinculadas a M são mantidas (o monstro M continua no Firestore).
 * Votos são descartados (voteCount zerado em A, B, C e M — votação não começou ainda).
 * Missões vinculadas a M permanecem com monsterId=M.id (M existe como doc inativo).
 */
export function unmergeMonster(sessionId, monsters, keepId, notifyFn) {
  if (!sessionId) return;
  const keep = monsters.find((m) => m.id === keepId);
  if (!keep?.mergedFrom?.length) return;

  const originalIds = keep.mergedFrom;

  const ops = [
    // Marca o monstro agrupado como desfeito (sai da lista ativa)
    { type: 'update', colName: 'monsters', itemId: keepId,
      data: { merged: true, unmerged: true } },
    // Restaura cada original
    ...originalIds.map((id) => ({
      type: 'update', colName: 'monsters', itemId: id,
      data: { merged: false, mergedInto: null },
    })),
  ];

  batchWrite(sessionId, ops).catch((e) =>
    console.warn('Firestore unmergeMonster batch failed:', e)
  );

  // Optimistic local: remove o keep da lista, restaura originais
  notifyFn(
    monsters
      .filter((m) => m.id !== keepId)
      .map((m) => originalIds.includes(m.id) ? { ...m, merged: false, mergedInto: null } : m)
  );
}

/**
 * Critério de ordenação do botão "ORDENAR POR VOTOS":
 * usa voteCount — o número de votos explícitos da fase de votação.
 */
function monsterScore(m) {
  return m.voteCount || 0;
}

export function prioritizeMonsters(sessionId, monsters, notifyFn) {
  if (!sessionId) return;
  const sorted = [...monsters].sort((a, b) => monsterScore(b) - monsterScore(a));
  // Batch write atômico: todos os priorityRanks numa única operação
  const ops = sorted.map((m, i) => ({
    type: 'update',
    colName: 'monsters',
    itemId: m.id,
    data: { priorityRank: i },
  }));
  if (ops.length > 0) {
    batchWrite(sessionId, ops).catch((e) =>
      console.warn('Firestore prioritizeMonsters batch failed:', e)
    );
  }
  notifyFn(sorted.map((m, i) => ({ ...m, priorityRank: i })));
}

// ── Solutions (legado — mantido para sessões antigas) ────────────────────────

export function addSolution(sessionId, solution) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  return saveItem(sessionId, 'solutions', solution);
}

export function voteSolution(sessionId, id, deviceId) {
  if (!sessionId) return;
  return castVote(sessionId, 'solutions', id, deviceId);
}

// ── Discussions ───────────────────────────────────────────────────────────────

/**
 * Adiciona uma nota de discussão vinculada a um monstro.
 * Apenas o SM pode chamar (verificado no cliente via canManageDiscussionNotes).
 * Não gera XP — notas são ferramentas de facilitação, não de gamificação.
 *
 * @param {string} sessionId
 * @param {{ id, monsterId, type, text, createdAt, updatedAt }} note
 */
export function addDiscussionNote(sessionId, note) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  return saveItem(sessionId, 'discussions', note);
}

/**
 * Edita texto e/ou tipo de uma nota de discussão existente.
 * @param {string} sessionId
 * @param {string} noteId
 * @param {{ type?: string, text?: string }} partial
 */
export function editDiscussionNote(sessionId, noteId, partial) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  const update = { ...partial, updatedAt: new Date().toISOString() };
  return patchItem(sessionId, 'discussions', noteId, update);
}

/**
 * Remove uma nota de discussão.
 */
export function removeDiscussionNote(sessionId, noteId) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  return removeItem(sessionId, 'discussions', noteId);
}

/**
 * Define (ou remove) o resultado final da discussão de um monstro.
 * Somente o SM pode chamar (verificado no cliente via canSetDiscussionResult).
 * @param {string} sessionId
 * @param {string} monsterId
 * @param {string|null} result — um dos valores de DISCUSSION_RESULTS ou null
 */
export function setMonsterDiscussionResult(sessionId, monsterId, result) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  return patchItem(sessionId, 'monsters', monsterId, { discussionResult: result ?? null });
}

// ── MonsterVotes ──────────────────────────────────────────────────────────────

/**
 * Registra o voto de um dispositivo em um monstro de forma atômica.
 *
 * Usa runTransaction:
 *   1. Tenta criar monsterVotes/{deviceId}_{monsterId} — falha se já existe.
 *   2. Incrementa monsters/{monsterId}.voteCount += 1.
 *
 * Lança 'already-voted' se o dispositivo já votou neste monstro.
 * Limite de 3 votos por dispositivo validado no cliente antes de chamar.
 */
export function castMonsterVoteOp(sessionId, monsterId, deviceId) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  return castMonsterVote(sessionId, monsterId, deviceId);
}

// ── Missions ──────────────────────────────────────────────────────────────────

export function addMission(sessionId, mission) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  return saveItem(sessionId, 'missions', mission);
}

export function removeMission(sessionId, id) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  return removeItem(sessionId, 'missions', id);
}
