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
  increment,
  batchWrite,
  castVote,
} from '../../services/firebase.js';
import { showErrorToast } from '../../components/xpToast.js';

// ── Checkins ──────────────────────────────────────────────────────────────────

export function addCheckin(sessionId, checkin) {
  if (!sessionId) return;
  saveItem(sessionId, 'checkins', checkin).catch((e) => {
    console.warn('Firestore addCheckin failed:', e);
    showErrorToast('Check-in não foi salvo — verifique sua conexão.');
  });
}

// ── Treasures ─────────────────────────────────────────────────────────────────

export function addTreasure(sessionId, treasure) {
  if (!sessionId) return;
  saveItem(sessionId, 'treasures', treasure).catch((e) => {
    console.warn('Firestore addTreasure failed:', e);
    showErrorToast('Tesouro não foi salvo — verifique sua conexão.');
  });
}

export function reactToTreasure(sessionId, id, reaction) {
  if (!sessionId) return;
  patchItem(sessionId, 'treasures', id, {
    [`reactions.${reaction}`]: increment(1),
  }).catch((e) => console.warn('Firestore reactToTreasure failed:', e));
}

// ── Monsters ──────────────────────────────────────────────────────────────────

export function addMonster(sessionId, monster) {
  if (!sessionId) return;
  saveItem(sessionId, 'monsters', monster).catch((e) => {
    console.warn('Firestore addMonster failed:', e);
    showErrorToast('Monstro não foi salvo — verifique sua conexão.');
  });
}

export function reactToMonster(sessionId, id, reaction) {
  if (!sessionId) return;
  patchItem(sessionId, 'monsters', id, {
    [`reactions.${reaction}`]: increment(1),
  }).catch((e) => console.warn('Firestore reactToMonster failed:', e));
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

  const merged = {
    ...(newText && newText !== keep.text ? { text: newText } : {}),
    reactions: {
      fire: (keep.reactions?.fire || 0) + (drop.reactions?.fire || 0),
      eyes: (keep.reactions?.eyes || 0) + (drop.reactions?.eyes || 0),
      bulb: (keep.reactions?.bulb || 0) + (drop.reactions?.bulb || 0),
    },
    selected: keep.selected || drop.selected,
    mergedFrom: [...(keep.mergedFrom || [keep.id]), drop.id],
  };

  // Batch write atômico: update do keep + delete do drop numa única operação
  batchWrite(sessionId, [
    { type: 'update', colName: 'monsters', itemId: keepId, data: merged },
    { type: 'delete', colName: 'monsters', itemId: dropId },
  ]).catch((e) => console.warn('Firestore mergeMonsters batch failed:', e));

  notifyFn(
    monsters
      .filter((m) => m.id !== dropId)
      .map((m) => (m.id === keepId ? { ...m, ...merged } : m))
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
  if (!sessionId) return;
  saveItem(sessionId, 'solutions', solution).catch((e) => {
    console.warn('Firestore addSolution failed:', e);
    showErrorToast('Solução não foi salva — verifique sua conexão.');
  });
}

export function voteSolution(sessionId, id, deviceId) {
  if (!sessionId) return;
  return castVote(sessionId, 'solutions', id, deviceId);
}

// ── Missions ──────────────────────────────────────────────────────────────────

export function addMission(sessionId, mission) {
  if (!sessionId) return;
  saveItem(sessionId, 'missions', mission).catch((e) => {
    console.warn('Firestore addMission failed:', e);
    showErrorToast('Missão não foi salva — verifique sua conexão.');
  });
}

export function removeMission(sessionId, id) {
  if (!sessionId) return;
  removeItem(sessionId, 'missions', id).catch((e) => {
    console.warn('Firestore removeMission failed:', e);
    showErrorToast('Falha ao remover missão — verifique sua conexão.');
  });
}
