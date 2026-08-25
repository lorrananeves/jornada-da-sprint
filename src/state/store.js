/**
 * Central State Store
 *
 * Arquitetura de persistência:
 *
 *   Documento raiz  sessions/{id}
 *     sprint, team, currentPhase, retroStarted, xp,
 *     smDeviceId, completedPhases, createdAt, updatedAt
 *
 *   Subcoleções (um documento por item — sem race condition)
 *     sessions/{id}/checkins/{itemId}
 *     sessions/{id}/treasures/{itemId}
 *     sessions/{id}/monsters/{itemId}
 *     sessions/{id}/solutions/{itemId}
 *     sessions/{id}/missions/{itemId}
 *
 * Fluxo:
 *   1. Carrega localStorage para evitar flash em branco.
 *   2. Conecta ao Firestore: carrega doc raiz + todas as subcoleções.
 *   3. Subscriptions em tempo real: doc raiz (fases) + cada subcoleção.
 *   4. Writes:
 *      - Campos escalares  → saveSession() (setDoc merge, só campos raiz)
 *      - XP               → incrementXP() (FieldValue.increment, atômico)
 *      - Adicionar item    → saveItem()    (setDoc no documento do item)
 *      - Atualizar item    → patchItem()   (updateDoc parcial)
 *      - Remover item      → removeItem()  (deleteDoc)
 */

import {
  getOrCreateSessionId,
  loadSession,
  loadCollection,
  saveSession,
  incrementXP,
  saveItem,
  patchItem,
  removeItem,
  subscribeSession,
  subscribeCollection,
  increment,
} from '../services/firebase.js';
import { getDeviceId } from '../services/presence.js';
import { showErrorToast } from '../components/xpToast.js';

const STORAGE_KEY = 'jornada_sprint_session';
const ROLE_KEY    = '_jornada_role';

// Nomes das subcoleções
const COLLECTIONS = ['checkins', 'treasures', 'monsters', 'solutions', 'missions'];

const DEFAULT_STATE = () => ({
  // ── doc raiz ──
  sprint:           { name: '', startDate: '', endDate: '' },
  team:             { name: '', participantCount: '' },
  currentPhase:     'home',
  retroStarted:     false,
  xp:               0,
  smDeviceId:       null,
  completedPhases:  [],
  phaseDurations:   {},   // { checkin: 5, treasures: 10, ... } em minutos; 0 = sem timer
  phaseStartedAt:   {},   // { checkin: ISOString } — momento em que a fase foi iniciada
  createdAt:        null, // preenchido na primeira gravação real
  updatedAt:        null, // null = nunca salvo localmente; qualquer update remoto passa
  // ── subcoleções (mantidas em memória como arrays) ──
  checkins:   [],
  treasures:  [],
  monsters:   [],
  solutions:  [],
  missions:   [],
});

let _state     = DEFAULT_STATE();
let _sessionId = null;
const _listeners = new Set();

// Unsubs das subscriptions em tempo real (doc raiz + cada subcoleção)
const _unsubs = [];

// ── Role (per-device, sessionStorage only) ────────────────────────────────────

export function getRole() {
  return sessionStorage.getItem(ROLE_KEY);
}

export function setRole(role) {
  sessionStorage.setItem(ROLE_KEY, role);
  if (role === 'scrum_master') {
    setScalarState({ smDeviceId: getDeviceId() });
  }
}

export function isSM() {
  return _state.smDeviceId === getDeviceId();
}

// ── localStorage (cache local) ────────────────────────────────────────────────

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) _state = { ...DEFAULT_STATE(), ...JSON.parse(raw) };
  } catch (e) {
    console.warn('Could not load saved session:', e);
  }
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save session:', e);
  }
}

// ── Subscribers ───────────────────────────────────────────────────────────────

function notify() {
  for (const listener of _listeners) {
    listener({ ..._state });
  }
}

export function subscribe(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function getState() {
  return { ..._state };
}

export function hasSavedSession() {
  const params = new URLSearchParams(window.location.search);
  return params.has('s') || !!localStorage.getItem(STORAGE_KEY);
}

// ── Campos escalares do doc raiz ─────────────────────────────────────────────

/**
 * Atualiza apenas campos escalares (doc raiz).
 * Nunca manda arrays — esses são gerenciados pelas funções de coleção abaixo.
 */
export function setState(partial) {
  const resolved = typeof partial === 'function' ? partial(_state) : partial;
  // Filtra para não reescrever subcoleções acidentalmente
  const { checkins: _c, treasures: _t, monsters: _m, solutions: _s, missions: _mi, ...scalars } = resolved;
  setScalarState(scalars);
}

function setScalarState(scalars) {
  const now = new Date().toISOString();
  _state = { ..._state, ...scalars, updatedAt: now, createdAt: _state.createdAt ?? now };
  saveToStorage(_state);

  if (_sessionId) {
    // Extrai apenas os campos do doc raiz (sem arrays nem role local)
    const {
      checkins: _c, treasures: _t, monsters: _m, solutions: _s, missions: _mi,
      role: _r,
      ..._firestoreScalars
    } = _state;
    saveSession(_sessionId, _firestoreScalars).catch((e) => {
      console.warn('Firestore scalar write failed:', e);
      showErrorToast('Falha ao salvar — verifique sua conexão.');
    });
  }

  notify();
}

// ── Collection sort helpers ───────────────────────────────────────────────────

/**
 * Ordena uma coleção recebida do Firestore respeitando priorityRank quando
 * disponível. Usado para monsters (e extensível a outras coleções no futuro).
 */
function sortCollection(col, items) {
  if (col !== 'monsters') return items;
  const ranked = items.filter((m) => m.priorityRank != null);
  if (ranked.length === 0) return items;
  // Se pelo menos um item tem rank, ordena toda a lista (itens sem rank vão para o final)
  return [...items].sort(
    (a, b) => (a.priorityRank ?? Infinity) - (b.priorityRank ?? Infinity)
  );
}

// ── Firebase init ─────────────────────────────────────────────────────────────

async function initFirebase() {
  _sessionId = getOrCreateSessionId();

  // 1. Carrega doc raiz
  let sessionExists = false;
  try {
    const remote = await loadSession(_sessionId);
    if (remote) {
      sessionExists = true;
      _state = { ..._state, ...remote };
      if (!getRole()) _state.currentPhase = 'roleSelect';
    } else if (_state.sprint?.name) {
      // Sessão nova com dados no localStorage — faz upload inicial dos escalares
      const {
        checkins: _c, treasures: _t, monsters: _m, solutions: _s, missions: _mi,
        ..._scalars
      } = _state;
      await saveSession(_sessionId, _scalars);
      sessionExists = true;
    }
    // Se não há sessão remota nem dados locais, o usuário está na tela home —
    // não há documento no Firestore ainda, portanto não abrimos subscriptions.
  } catch (e) {
    console.warn('Could not load session root from Firestore:', e);
  }

  // 2. Carrega e assina subcoleções apenas quando o documento raiz existe.
  //    Sem isso, os onSnapshot disparariam imediatamente com permission-denied
  //    porque as regras bloqueiam leituras em sessions/{id}/* sem doc raiz.
  if (sessionExists) {
    try {
      const [checkins, treasures, monsters, solutions, missions] = await Promise.all(
        COLLECTIONS.map((col) => loadCollection(_sessionId, col))
      );
      _state = { ..._state, checkins, treasures, monsters, solutions, missions };
    } catch (e) {
      console.warn('Could not load subcollections from Firestore:', e);
    }
  }

  saveToStorage(_state);
  notify();

  // 3. Subscription ao doc raiz (fases, sprint, time…)
  //    Sempre abrimos — permite detectar quando o SM cria a sessão remotamente.
  _unsubs.push(
    subscribeSession(_sessionId, (remoteScalars) => {
      // Ignora se não há timestamp ou se o dado remoto não é mais recente que o local.
      // Quando _state.updatedAt é null (estado padrão, sem gravação local), aceita sempre.
      if (remoteScalars.updatedAt && _state.updatedAt && remoteScalars.updatedAt <= _state.updatedAt) return;

      const wasExisting = sessionExists;
      sessionExists = true;
      _state = { ..._state, ...remoteScalars };
      delete _state.role;
      saveToStorage(_state);
      notify();

      // 4. Se as subscriptions de subcoleção ainda não foram abertas
      //    (sessão criada remotamente após o carregamento inicial), abre agora.
      if (!wasExisting) {
        for (const col of COLLECTIONS) {
          _unsubs.push(
            subscribeCollection(_sessionId, col, (items) => {
              _state = { ..._state, [col]: sortCollection(col, items) };
              saveToStorage(_state);
              notify();
            })
          );
        }
      }
    })
  );

  // 4. Subscriptions às subcoleções — só se a sessão já existia ao carregar
  if (sessionExists) {
    for (const col of COLLECTIONS) {
      _unsubs.push(
        subscribeCollection(_sessionId, col, (items) => {
          _state = { ..._state, [col]: sortCollection(col, items) };
          saveToStorage(_state);
          notify();
        })
      );
    }
  }
}

// ── Phase helpers ─────────────────────────────────────────────────────────────

export function setPhase(phase) {
  if (!isSM()) {
    console.warn('[setPhase] bloqueado — somente o Scrum Master pode avançar fases.');
    return;
  }
  // Registra o momento de início da fase para o timer
  const phaseStartedAt = { ..._state.phaseStartedAt, [phase]: new Date().toISOString() };
  setScalarState({ currentPhase: phase, phaseStartedAt });
}

/**
 * Navega localmente para uma fase sem persistir no Firestore e sem checar SM.
 * Usado pelo membro do time para mudar de tela localmente (ex: roleSelect → lobby).
 */
export function setLocalPhase(phase) {
  _state = { ..._state, currentPhase: phase };
  notify();
}

export function completePhase(phase) {
  if (!isSM()) return;
  const completedPhases = _state.completedPhases.includes(phase)
    ? _state.completedPhases
    : [..._state.completedPhases, phase];
  setScalarState({ completedPhases });
}

// ── XP (incremento atômico) ───────────────────────────────────────────────────

export function addXP(amount) {
  // Otimismo local imediato
  _state = { ..._state, xp: _state.xp + amount };
  saveToStorage(_state);
  notify();

  // Atomic increment no Firestore — sem race condition
  if (_sessionId) {
    incrementXP(_sessionId, amount).catch((e) =>
      console.warn('Firestore XP increment failed:', e)
    );
  }
  return amount;
}

// ── Checkins ──────────────────────────────────────────────────────────────────

export function addCheckin(checkin) {
  if (!_sessionId) return;
  saveItem(_sessionId, 'checkins', checkin).catch((e) => {
    console.warn('Firestore addCheckin failed:', e);
    showErrorToast('Check-in não foi salvo — verifique sua conexão.');
  });
}

// ── Treasures ─────────────────────────────────────────────────────────────────

export function addTreasure(treasure) {
  if (!_sessionId) return;
  saveItem(_sessionId, 'treasures', treasure).catch((e) => {
    console.warn('Firestore addTreasure failed:', e);
    showErrorToast('Tesouro não foi salvo — verifique sua conexão.');
  });
}

export function reactToTreasure(id, reaction) {
  if (!_sessionId) return;
  patchItem(_sessionId, 'treasures', id, {
    [`reactions.${reaction}`]: increment(1),
  }).catch((e) => console.warn('Firestore reactToTreasure failed:', e));
}

// ── Monsters ──────────────────────────────────────────────────────────────────

export function addMonster(monster) {
  if (!_sessionId) return;
  saveItem(_sessionId, 'monsters', monster).catch((e) => {
    console.warn('Firestore addMonster failed:', e);
    showErrorToast('Monstro não foi salvo — verifique sua conexão.');
  });
}

export function reactToMonster(id, reaction) {
  if (!_sessionId) return;
  patchItem(_sessionId, 'monsters', id, {
    [`reactions.${reaction}`]: increment(1),
  }).catch((e) => console.warn('Firestore reactToMonster failed:', e));
}

export function selectMonster(id) {
  if (!_sessionId) return;
  const monster = _state.monsters.find((m) => m.id === id);
  if (!monster) return;
  patchItem(_sessionId, 'monsters', id, { selected: !monster.selected }).catch((e) =>
    console.warn('Firestore selectMonster failed:', e)
  );
}

export function mergeMonsters(keepId, dropId, newText) {
  if (!_sessionId) return;
  const keep = _state.monsters.find((m) => m.id === keepId);
  const drop = _state.monsters.find((m) => m.id === dropId);
  if (!keep || !drop) return;

  // Soma reactions e preserva selected se qualquer um estava selecionado
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

  patchItem(_sessionId, 'monsters', keepId, merged).catch((e) =>
    console.warn('Firestore mergeMonsters patch failed:', e)
  );
  removeItem(_sessionId, 'monsters', dropId).catch((e) =>
    console.warn('Firestore mergeMonsters remove failed:', e)
  );

  // Optimistic local update
  _state = {
    ..._state,
    monsters: _state.monsters
      .filter((m) => m.id !== dropId)
      .map((m) => m.id === keepId ? { ...m, ...merged } : m),
  };
  notify();
}

export function prioritizeMonsters() {
  if (!_sessionId) return;
  const sorted = [..._state.monsters].sort(
    (a, b) => (b.reactions?.fire || 0) - (a.reactions?.fire || 0)
  );
  // Persiste a ordem como priorityRank em cada documento para que todos os
  // participantes vejam a mesma ordem.
  sorted.forEach((m, i) => {
    patchItem(_sessionId, 'monsters', m.id, { priorityRank: i }).catch((e) =>
      console.warn('Firestore prioritizeMonsters failed:', e)
    );
  });
  // Optimistic local update — subscribeCollection vai confirmar com os dados reais
  _state = { ..._state, monsters: sorted.map((m, i) => ({ ...m, priorityRank: i })) };
  notify();
}

// ── Solutions ─────────────────────────────────────────────────────────────────

export function addSolution(solution) {
  if (!_sessionId) return;
  saveItem(_sessionId, 'solutions', solution).catch((e) => {
    console.warn('Firestore addSolution failed:', e);
    showErrorToast('Solução não foi salva — verifique sua conexão.');
  });
}

export function voteSolution(id) {
  if (!_sessionId) return;
  patchItem(_sessionId, 'solutions', id, {
    votes: increment(1),
  }).catch((e) => console.warn('Firestore voteSolution failed:', e));
}

// ── Missions ──────────────────────────────────────────────────────────────────

export function addMission(mission) {
  if (!_sessionId) return;
  saveItem(_sessionId, 'missions', mission).catch((e) => {
    console.warn('Firestore addMission failed:', e);
    showErrorToast('Missão não foi salva — verifique sua conexão.');
  });
}

export function removeMission(id) {
  if (!_sessionId) return;
  removeItem(_sessionId, 'missions', id).catch((e) => {
    console.warn('Firestore removeMission failed:', e);
    showErrorToast('Falha ao remover missão — verifique sua conexão.');
  });
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export function resetState() {
  _state = DEFAULT_STATE();
  localStorage.removeItem(STORAGE_KEY);
  notify();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

loadFromStorage();
initFirebase();
