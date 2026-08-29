/**
 * store/index.js — ponto de entrada público do store
 *
 * Re-exporta tudo de session.js e collections.js com a mesma assinatura
 * pública que o antigo store.js tinha, para que nenhum caller precise mudar.
 *
 * As funções de coleção são envolvidas em closures que injetam `sessionId`
 * e o estado atual, mantendo a API original de 1-2 argumentos.
 *
 * Reações (react/vote) têm proteção client-side contra duplicatas:
 * o mesmo dispositivo só pode reagir uma vez por item por reação.
 */

export {
  // estado
  getState,
  hasSavedSession,
  setState,
  subscribe,
  // fases
  setPhase,
  setLocalPhase,
  completePhase,
  // xp
  addXP,
  // autenticação / papel
  getRole,
  setRole,
  isSM,
  // sessão
  resetState,
  startNewSession,
  // sinalização "Terminei"
  signalReady,
  // parking lot
  addParkingItem,
  removeParkingItem,
} from './session.js';

import { getState, getSessionId, setCollection } from './session.js';
import { getDeviceId } from '../../services/presence.js';
import { hasReacted, markReacted } from '../../services/reactions.js';
import {
  addCheckin    as _addCheckin,
  addTreasure   as _addTreasure,
  reactToTreasure as _reactToTreasure,
  addMonster    as _addMonster,
  reactToMonster as _reactToMonster,
  selectMonster  as _selectMonster,
  renameMonster  as _renameMonster,
  deleteMonster  as _deleteMonster,
  mergeMonsters  as _mergeMonsters,
  unmergeMonster as _unmergeMonster,
  prioritizeMonsters as _prioritizeMonsters,
  addSolution   as _addSolution,
  voteSolution  as _voteSolution,
  addDiscussionNote   as _addDiscussionNote,
  editDiscussionNote  as _editDiscussionNote,
  removeDiscussionNote as _removeDiscussionNote,
  castMonsterVoteOp   as _castMonsterVoteOp,
  addMission    as _addMission,
  removeMission  as _removeMission,
} from './collections.js';

// Helpers para injetar contexto nos wrappers de coleção
const sid = () => getSessionId();
const monsters = () => getState().monsters;
const patchMonsters = (items) => setCollection('monsters', items);

export const addCheckin       = (c)          => _addCheckin(sid(), c);
export const addTreasure      = (t)          => _addTreasure(sid(), t);

export async function reactToTreasure(id, reaction) {
  const sessionId = sid();
  const deviceId  = getDeviceId();
  if (hasReacted(sessionId, 'treasures', id, deviceId, reaction)) return false;
  try {
    await _reactToTreasure(sessionId, id, reaction, deviceId);
    markReacted(sessionId, 'treasures', id, deviceId, reaction);
    return true;
  } catch (e) {
    if (e?.message === 'already-reacted') {
      markReacted(sessionId, 'treasures', id, deviceId, reaction);
      return false;
    }
    console.warn('Firestore reactToTreasure failed:', e);
    return false;
  }
}

export const addMonster       = (m)          => _addMonster(sid(), m);

export async function reactToMonster(id, reaction) {
  const sessionId = sid();
  const deviceId  = getDeviceId();
  if (hasReacted(sessionId, 'monsters', id, deviceId, reaction)) return false;
  try {
    await _reactToMonster(sessionId, id, reaction, deviceId);
    markReacted(sessionId, 'monsters', id, deviceId, reaction);
    return true;
  } catch (e) {
    if (e?.message === 'already-reacted') {
      markReacted(sessionId, 'monsters', id, deviceId, reaction);
      return false;
    }
    console.warn('Firestore reactToMonster failed:', e);
    return false;
  }
}

export const selectMonster      = (id)         => _selectMonster(sid(), monsters(), id);
export const renameMonster      = (id, text)   => _renameMonster(sid(), id, text);
export const deleteMonster      = (id)         => _deleteMonster(sid(), id);
export const mergeMonsters      = (k, d, t)    => _mergeMonsters(sid(), monsters(), k, d, t, patchMonsters);
export const unmergeMonster     = (id)         => _unmergeMonster(sid(), monsters(), id, patchMonsters);
export const prioritizeMonsters = ()           => _prioritizeMonsters(sid(), monsters(), patchMonsters);
export const addSolution        = (s)          => _addSolution(sid(), s);

export async function voteSolution(id) {
  const sessionId = sid();
  const deviceId  = getDeviceId();
  if (hasReacted(sessionId, 'solutions', id, deviceId, 'vote')) return false;
  try {
    await _voteSolution(sessionId, id, deviceId);
    markReacted(sessionId, 'solutions', id, deviceId, 'vote');
    return true;
  } catch (e) {
    if (e?.message === 'already-voted') {
      markReacted(sessionId, 'solutions', id, deviceId, 'vote');
      return false;
    }
    console.warn('Firestore voteSolution failed:', e);
    return false;
  }
}

// ── Discussions ───────────────────────────────────────────────────────────────

export const addDiscussionNote    = (note)           => _addDiscussionNote(sid(), note);
export const editDiscussionNote   = (id, partial)    => _editDiscussionNote(sid(), id, partial);
export const removeDiscussionNote = (id)             => _removeDiscussionNote(sid(), id);

// ── MonsterVotes ──────────────────────────────────────────────────────────────

/**
 * Vota em um monstro durante a fase de priorização.
 * Proteção dupla:
 *   1. Client-side: verifica limite de 3 votos e duplicata local (hasReacted).
 *   2. Firestore: transação atômica rejeita ID duplicado.
 */
export async function voteOnMonster(monsterId) {
  const sessionId = sid();
  const deviceId  = getDeviceId();

  // Proteção de duplicata local (igual às reações e voteSolution)
  if (hasReacted(sessionId, 'monsterVotes', monsterId, deviceId, 'vote')) return false;

  // Limite de 3 votos por dispositivo
  const myVotes = getState().monsterVotes.filter((v) => v.deviceId === deviceId);
  if (myVotes.length >= 3) return false;

  try {
    await _castMonsterVoteOp(sessionId, monsterId, deviceId);
    markReacted(sessionId, 'monsterVotes', monsterId, deviceId, 'vote');
    return true;
  } catch (e) {
    if (e?.message === 'already-voted') {
      markReacted(sessionId, 'monsterVotes', monsterId, deviceId, 'vote');
      return false;
    }
    console.warn('Firestore voteOnMonster failed:', e);
    return false;
  }
}

// ── Missions ──────────────────────────────────────────────────────────────────

export const addMission       = (m)          => _addMission(sid(), m);
export const removeMission    = (id)         => _removeMission(sid(), id);
