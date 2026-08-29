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

export function prioritizeMonsters(sessionId, monsters, notifyFn) {
  if (!sessionId) return;
  const sorted = [...monsters].sort(
    (a, b) => (b.reactions?.fire || 0) - (a.reactions?.fire || 0)
  );
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

// ── Solutions ─────────────────────────────────────────────────────────────────

export function addSolution(sessionId, solution) {
  if (!sessionId) return Promise.reject(new Error('sessionId ausente'));
  return saveItem(sessionId, 'solutions', solution);
}

export function voteSolution(sessionId, id, deviceId) {
  if (!sessionId) return;
  return castVote(sessionId, 'solutions', id, deviceId);
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
