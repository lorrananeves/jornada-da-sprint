/**
 * store/index.js — ponto de entrada público do store
 *
 * Re-exporta tudo de session.js e collections.js com a mesma assinatura
 * pública que o antigo store.js tinha, para que nenhum caller precise mudar.
 *
 * As funções de coleção são envolvidas em closures que injetam `sessionId`
 * e o estado atual, mantendo a API original de 1-2 argumentos.
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
export const reactToTreasure  = (id, r)      => _reactToTreasure(sid(), id, r);
export const addMonster       = (m)          => _addMonster(sid(), m);
export const reactToMonster   = (id, r)      => _reactToMonster(sid(), id, r);
export const selectMonster    = (id)         => _selectMonster(sid(), monsters(), id);
export const mergeMonsters    = (k, d, t)    => _mergeMonsters(sid(), monsters(), k, d, t, patchMonsters);
export const prioritizeMonsters = ()         => _prioritizeMonsters(sid(), monsters(), patchMonsters);
export const addSolution      = (s)          => _addSolution(sid(), s);
export const voteSolution     = (id)         => _voteSolution(sid(), id);
export const addMission       = (m)          => _addMission(sid(), m);
export const removeMission    = (id)         => _removeMission(sid(), id);
