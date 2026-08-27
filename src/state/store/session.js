/**
 * Session — estado central da sessão de retrospectiva
 *
 * Arquitetura de persistência:
 *
 *   Documento raiz  sessions/{id}
 *     sprint, team, currentPhase, retroStarted, xp,
 *     smDeviceId, smUid, completedPhases, createdAt, updatedAt
 *
 *   Subcoleções (um documento por item — sem race condition)
 *     sessions/{id}/checkins/{itemId}
 *     sessions/{id}/treasures/{itemId}
 *     sessions/{id}/monsters/{itemId}
 *     sessions/{id}/solutions/{itemId}
 *     sessions/{id}/missions/{itemId}
 *
 *   Perfil do SM (autenticado)
 *     smProfiles/{uid}
 *     smProfiles/{uid}/sessions/{sessionId}   ← resumo de cada retro
 *
 * Fluxo:
 *   1. initAuth() aguarda o Firebase Auth resolver o estado de login.
 *   2. Carrega localStorage para evitar flash em branco.
 *   3. Conecta ao Firestore: carrega doc raiz + todas as subcoleções.
 *   4. Subscriptions em tempo real: doc raiz (fases) + cada subcoleção.
 *   5. Writes:
 *      - Campos escalares  → saveSession() (setDoc merge, só campos raiz)
 *      - XP               → incrementXP() (FieldValue.increment, atômico)
 *      - Adicionar item    → saveItem()    (setDoc no documento do item)
 *      - Atualizar item    → patchItem()   (updateDoc parcial)
 *      - Remover item      → removeItem()  (deleteDoc)
 */

import {
  getOrCreateSessionId,
  generateId,
  loadSession,
  loadCollection,
  saveSession,
  incrementXP,
  subscribeSession,
  subscribeCollection,
  saveSmProfile,
  upsertSmSession,
} from '../../services/firebase.js';
import { getDeviceId } from '../../services/presence.js';
import { initAuth, getCurrentUser, onAuthChange } from '../../services/auth.js';
import { showErrorToast } from '../../components/xpToast.js';
import { isSM as _isSM } from './role.js';

const STORAGE_KEY = 'jornada_sprint_session';

// Nomes das subcoleções
const COLLECTIONS = ['checkins', 'treasures', 'monsters', 'solutions', 'missions'];

const DEFAULT_STATE = () => ({
  // ── doc raiz ──
  sprint:              { name: '', startDate: '', endDate: '' },
  team:                { name: '', participantCount: '' },
  currentPhase:        'home',
  retroStarted:        false,
  xp:                  0,
  smDeviceId:          null,
  smUid:               null,
  completedPhases:     [],
  phaseDurations:      {},
  phaseStartedAt:      {},
  createdAt:           null,
  updatedAt:           null,
  // ── foco do Combate (sincronizado entre participantes) ──
  combatMonsterIdx:    0,
  combatStrategy:      'prevent',
  // ── sinais "Terminei" por fase { [deviceId]: phaseId } ──
  readySignals:        {},
  // ── parking lot (notas "para depois", acessíveis em qualquer fase) ──
  parkingLot:          [],
  // ── subcoleções ──
  checkins:   [],
  treasures:  [],
  monsters:   [],
  solutions:  [],
  missions:   [],
});

let _state     = DEFAULT_STATE();
let _sessionId = null;
const _listeners = new Set();
const _unsubs = [];

// ── Getters internos (para modules irmãos) ────────────────────────────────────

export function getSessionId() { return _sessionId; }

// ── localStorage ─────────────────────────────────────────────────────────────

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) _state = { ...DEFAULT_STATE(), ...JSON.parse(raw) };
  } catch (e) {
    console.warn('Could not load saved session:', e);
  }
}

function saveToStorage(state) {
  const { _guestAutoJoin: _g, ...storableState } = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storableState));
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

// ── Escrita de coleções (chamada por collections.js) ──────────────────────────

/**
 * Atualiza apenas a subcoleção `col` no estado em memória e notifica.
 * Chamado pelos handlers de coleção depois de uma operação local.
 */
export function setCollection(col, items) {
  _state = { ..._state, [col]: items };
  notify();
}

// ── Campos escalares do doc raiz ─────────────────────────────────────────────

export function setState(partial) {
  const resolved = typeof partial === 'function' ? partial(_state) : partial;
  const { checkins: _c, treasures: _t, monsters: _m, solutions: _s, missions: _mi, ...scalars } = resolved;
  setScalarState(scalars);
}

export function setScalarState(scalars) {
  const now = new Date().toISOString();
  _state = { ..._state, ...scalars, updatedAt: now, createdAt: _state.createdAt ?? now };
  saveToStorage(_state);

  if (_sessionId) {
    const {
      checkins: _c, treasures: _t, monsters: _m, solutions: _s, missions: _mi,
      role: _r,
      _guestAutoJoin: _g,
      ..._firestoreScalars
    } = _state;
    saveSession(_sessionId, _firestoreScalars).catch((e) => {
      console.warn('Firestore scalar write failed:', e);
      showErrorToast('Falha ao salvar — verifique sua conexão.');
    });

    _syncSmProfile();
  }

  notify();
}

function _syncSmProfile() {
  if (!isSM()) return;
  const user = getCurrentUser();
  if (!user) return;
  if (!_sessionId) return;

  const status = _state.completedPhases.includes('complete') || _state.currentPhase === 'report'
    ? 'completed'
    : _state.retroStarted
    ? 'active'
    : 'setup';

  upsertSmSession(user.uid, _sessionId, {
    sessionId:   _sessionId,
    sprintName:  _state.sprint?.name || '',
    teamName:    _state.team?.name   || '',
    createdAt:   _state.createdAt,
    lastPhase:   _state.currentPhase,
    status,
  }).catch((e) => console.warn('[store] upsertSmSession failed:', e));
}

// ── Collection sort helpers ───────────────────────────────────────────────────

function sortCollection(col, items) {
  if (col !== 'monsters') return items;
  const ranked = items.filter((m) => m.priorityRank != null);
  if (ranked.length === 0) return items;
  return [...items].sort(
    (a, b) => (a.priorityRank ?? Infinity) - (b.priorityRank ?? Infinity)
  );
}

// ── Firebase init ─────────────────────────────────────────────────────────────

async function initFirebase() {
  _sessionId = getOrCreateSessionId();

  let sessionExists = false;
  try {
    const remote = await loadSession(_sessionId);
    if (remote) {
      sessionExists = true;
      _state = { ..._state, ...remote };
      if (!getRole()) {
        _state.currentPhase = 'roleSelect';
        _state._guestAutoJoin = true;
      }
    }
  } catch (e) {
    console.warn('Could not load session root from Firestore:', e);
  }

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

  let subcollsOpen = sessionExists;

  _unsubs.push(
    subscribeSession(_sessionId, (remoteScalars) => {
      if (!subcollsOpen) {
        subcollsOpen = true;
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

      if (remoteScalars.updatedAt && _state.updatedAt && remoteScalars.updatedAt <= _state.updatedAt) return;

      const keepPhase = _state.currentPhase === 'roleSelect';
      _state = { ..._state, ...remoteScalars };
      if (keepPhase) _state.currentPhase = 'roleSelect';
      delete _state.role;
      saveToStorage(_state);
      notify();
    })
  );

  if (sessionExists) {
    subcollsOpen = true;
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

// ── Parking Lot ───────────────────────────────────────────────────────────────

export function addParkingItem(text) {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const item = { id, text, createdAt: new Date().toISOString() };
  const parkingLot = [...(_state.parkingLot || []), item];
  setScalarState({ parkingLot });
}

export function removeParkingItem(id) {
  const parkingLot = (_state.parkingLot || []).filter((i) => i.id !== id);
  setScalarState({ parkingLot });
}

// ── Ready signals ("Terminei") ────────────────────────────────────────────────

/**
 * Registra que o dispositivo atual terminou a fase indicada.
 * Qualquer participante pode chamar (não requer isSM).
 * Persiste em readySignals[deviceId] = phaseId no doc raiz.
 */
export function signalReady(phase) {
  const deviceId = getDeviceId();
  const readySignals = { ..._state.readySignals, [deviceId]: phase };
  setScalarState({ readySignals });
}

// ── Phase helpers ─────────────────────────────────────────────────────────────

export function setPhase(phase) {
  if (!isSM()) {
    console.warn('[setPhase] bloqueado — somente o Scrum Master pode avançar fases.');
    return;
  }
  const phaseStartedAt = { ..._state.phaseStartedAt, [phase]: new Date().toISOString() };
  setScalarState({ currentPhase: phase, phaseStartedAt });
}

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

// ── XP ────────────────────────────────────────────────────────────────────────

export function addXP(amount) {
  _state = { ..._state, xp: _state.xp + amount };
  saveToStorage(_state);
  notify();

  if (_sessionId) {
    incrementXP(_sessionId, amount).catch((e) =>
      console.warn('Firestore XP increment failed:', e)
    );
  }
  return amount;
}

// ── Reset & Nova sessão ───────────────────────────────────────────────────────

export function resetState() {
  _state = DEFAULT_STATE();
  localStorage.removeItem(STORAGE_KEY);
  notify();
}

export function startNewSession() {
  _unsubs.forEach((u) => u());
  _unsubs.length = 0;

  const newId = generateId();
  const params = new URLSearchParams(window.location.search);
  params.set('s', newId);
  window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  _sessionId = newId;

  _state = DEFAULT_STATE();
  localStorage.removeItem(STORAGE_KEY);

  const user = getCurrentUser();
  setScalarState({
    smDeviceId: getDeviceId(),
    smUid:      user ? user.uid : null,
    currentPhase: 'setup',
    createdAt:  new Date().toISOString(),
  });
  sessionStorage.setItem('_jornada_role', 'scrum_master');

  initFirebase();
}

// ── isSM (wrapper local) ──────────────────────────────────────────────────────
// Mantido aqui para que setScalarState/_syncSmProfile o usem sem import circular.

export function isSM() {
  return _isSM(_state.smDeviceId);
}

// ── Role (reexportado do módulo role) ─────────────────────────────────────────
// Importado via index.js; exposto aqui para setRole ter acesso a setScalarState.

import { getRole, setRole as _setRole } from './role.js';
export { getRole };
export function setRole(role) {
  _setRole(role, setScalarState);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

loadFromStorage();

initAuth().then((user) => {
  const preSessionPhases = new Set(['auth', 'home', 'roleSelect']);
  if (user && preSessionPhases.has(_state.currentPhase)) {
    saveSmProfile(user.uid, {
      displayName: user.displayName || '',
      email:       user.email || '',
      photoURL:    user.photoURL || '',
      createdAt:   new Date().toISOString(),
    }).catch((e) => console.warn('[store] saveSmProfile failed:', e));

    _state = { ..._state, currentPhase: 'smDashboard' };
    notify();
  }

  initFirebase();
});

onAuthChange((user) => {
  const phase = _state.currentPhase;

  if (user) {
    saveSmProfile(user.uid, {
      displayName: user.displayName || '',
      email:       user.email       || '',
      photoURL:    user.photoURL    || '',
    }).catch((e) => console.warn('[store] saveSmProfile failed:', e));

    const preSessionPhases = new Set(['auth', 'home', 'roleSelect']);
    if (preSessionPhases.has(phase)) {
      _state = { ..._state, currentPhase: 'smDashboard' };
      notify();
    }
  } else {
    const smPhases = new Set(['auth', 'smDashboard', 'setup', 'lobby']);
    if (smPhases.has(phase)) {
      _state = { ..._state, currentPhase: 'home' };
      notify();
    }
  }
});
