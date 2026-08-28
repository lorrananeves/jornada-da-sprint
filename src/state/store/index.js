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
  mergeMonsters  as _mergeMonsters,
  prioritizeMonsters as _prioritizeMonsters,
  addSolution   as _addSolution,
  voteSolution  as _voteSolution,
  addMission    as _addMission,
  removeMission  as _removeMission,
} from './collections.js';

// Helpers para injetar contexto nos wrappers de coleção
const sid = () => getSessionId();
const monsters = () => getState().monsters;
const patchMonsters = (items) => setCollection('monsters', items);

export const addCheckin       = (c)          => _addCheckin(sid(), c);
export const addTreasure      = (t)          => _addTreasure(sid(), t);

export function reactToTreasure(id, reaction) {
  const sessionId = sid();
  const deviceId  = getDeviceId();
  if (hasReacted(sessionId, 'treasures', id, deviceId, reaction)) return false;
  markReacted(sessionId, 'treasures', id, deviceId, reaction);
  _reactToTreasure(sessionId, id, reaction);
  return true;
}

export const addMonster       = (m)          => _addMonster(sid(), m);

export function reactToMonster(id, reaction) {
  const sessionId = sid();
  const deviceId  = getDeviceId();
  if (hasReacted(sessionId, 'monsters', id, deviceId, reaction)) return false;
  markReacted(sessionId, 'monsters', id, deviceId, reaction);
  _reactToMonster(sessionId, id, reaction);
  return true;
}

export const selectMonster    = (id)         => _selectMonster(sid(), monsters(), id);
export const mergeMonsters    = (k, d, t)    => _mergeMonsters(sid(), monsters(), k, d, t, patchMonsters);
export const prioritizeMonsters = ()         => _prioritizeMonsters(sid(), monsters(), patchMonsters);
export const addSolution      = (s)          => _addSolution(sid(), s);

export function voteSolution(id) {
  const sessionId = sid();
  const deviceId  = getDeviceId();
  if (hasReacted(sessionId, 'solutions', id, deviceId, 'vote')) return false;
  markReacted(sessionId, 'solutions', id, deviceId, 'vote');
  _voteSolution(sessionId, id);
  return true;
}

export const addMission       = (m)          => _addMission(sid(), m);
export const removeMission    = (id)         => _removeMission(sid(), id);
