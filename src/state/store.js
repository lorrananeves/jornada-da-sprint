/**
 * Central State Store
 *
 * – localStorage  : fallback / cache local por device
 * – Firestore     : fonte de verdade compartilhada entre todos os devices
 *
 * Fluxo:
 *   1. Ao iniciar, carrega do localStorage para evitar flash em branco.
 *   2. Conecta ao Firestore e substitui o estado pelo documento remoto.
 *   3. Qualquer setState() persiste no Firestore (e no localStorage).
 *   4. O listener em tempo real propaga mudanças feitas por outros devices.
 */

import {
  getOrCreateSessionId,
  loadSession,
  saveSession,
  subscribeSession,
} from '../services/firebase.js';
import { getDeviceId } from '../services/presence.js';

const STORAGE_KEY = 'jornada_sprint_session';
const ROLE_KEY    = '_jornada_role'; // sessionStorage — per-device, never synced

const DEFAULT_STATE = () => ({
  sprint: { name: '', startDate: '', endDate: '' },
  team: { name: '', participantCount: '' },
  currentPhase: 'home',
  retroStarted: false,  // true once SM presses "Iniciar Retrospectiva"
  xp: 0,
  checkins: [],
  treasures: [],
  monsters: [],
  solutions: [],
  missions: [],
  completedPhases: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

let _state     = DEFAULT_STATE();
let _sessionId = null;
let _listeners = new Set();

// ── Role (per-device, sessionStorage only) ────────────────────────────────────

/** Get this device's role ('scrum_master' | 'team_member' | null) */
export function getRole() {
  return sessionStorage.getItem(ROLE_KEY);
}

/**
 * Set this device's role.
 * Se for scrum_master, grava também o smDeviceId no Firestore para que
 * a proteção de avanço de fase seja verificável no lado do servidor.
 */
export function setRole(role) {
  sessionStorage.setItem(ROLE_KEY, role);
  if (role === 'scrum_master') {
    // Registra o deviceId do SM no estado compartilhado
    setState({ smDeviceId: getDeviceId() });
  }
}

/**
 * Retorna true se este device for o Scrum Master legítimo.
 * A verificação usa o smDeviceId gravado no Firestore, não apenas
 * o valor local do sessionStorage.
 */
export function isSM() {
  return _state.smDeviceId === getDeviceId();
}

// Flag para evitar que o listener remoto reescreva o Firestore em loop
let _remoteUpdate = false;

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

/** Subscribe to state changes. Returns unsubscribe function. */
export function subscribe(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/** Get current state snapshot (shallow copy) */
export function getState() {
  return { ..._state };
}

/** Check if a saved session exists (local or remote via URL param) */
export function hasSavedSession() {
  const params = new URLSearchParams(window.location.search);
  return params.has('s') || !!localStorage.getItem(STORAGE_KEY);
}

// ── Core setState ─────────────────────────────────────────────────────────────

/**
 * Set state with partial update. Persists to Firestore + localStorage + notifies.
 */
export function setState(partial) {
  if (typeof partial === 'function') {
    _state = { ..._state, ...partial(_state) };
  } else {
    _state = { ..._state, ...partial };
  }
  _state.updatedAt = new Date().toISOString();

  saveToStorage(_state);

  if (_sessionId) {
    // Never persist the local role to Firestore — it's per-device
    const { role: _ignored, ...firestoreState } = _state;
    saveSession(_sessionId, firestoreState).catch((e) =>
      console.warn('Firestore write failed:', e)
    );
  }

  notify();
}

// ── Firebase init ─────────────────────────────────────────────────────────────

async function initFirebase() {
  _sessionId = getOrCreateSessionId();

  // 1. Tenta carregar o estado já existente no Firestore
  try {
    const remote = await loadSession(_sessionId);
    if (remote) {
      _state = { ...DEFAULT_STATE(), ...remote };

      // If this device hasn't chosen a role yet, send to role selection
      // (handles team members entering via shared link)
      if (!getRole()) {
        _state.currentPhase = 'roleSelect';
      }

      saveToStorage(_state);
      notify();
    } else if (_state.sprint?.name) {
      // Sessão nova mas localStorage tem dados — faz upload inicial
      await saveSession(_sessionId, _state);
    }
  } catch (e) {
    console.warn('Could not load session from Firestore:', e);
  }

  // 2. Escuta mudanças em tempo real (outros devices)
  subscribeSession(_sessionId, (remoteState) => {
    // Ignora se o update veio de nós mesmos (evita loop)
    if (_remoteUpdate) return;

    // Só aplica se o estado remoto for mais recente
    if (remoteState.updatedAt && remoteState.updatedAt <= _state.updatedAt) return;

    _remoteUpdate = true;
    _state = { ...DEFAULT_STATE(), ...remoteState };
    // role is per-device only — never apply it from remote
    delete _state.role;
    saveToStorage(_state);
    notify();
    _remoteUpdate = false;
  });
}

// ── Phase helpers ─────────────────────────────────────────────────────────────

/**
 * Avança para uma fase.
 * Só o Scrum Master (deviceId verificado contra smDeviceId no Firestore)
 * pode alterar currentPhase. Para membros do time, a chamada é ignorada.
 */
export function setPhase(phase) {
  if (!isSM()) {
    console.warn('[setPhase] bloqueado — somente o Scrum Master pode avançar fases.');
    return;
  }
  setState({ currentPhase: phase });
}

/**
 * Marca uma fase como concluída.
 * Igualmente restrito ao Scrum Master.
 */
export function completePhase(phase) {
  if (!isSM()) return;
  setState((s) => ({
    completedPhases: s.completedPhases.includes(phase)
      ? s.completedPhases
      : [...s.completedPhases, phase],
  }));
}

/** Add XP */
export function addXP(amount) {
  setState((s) => ({ xp: s.xp + amount }));
  return amount;
}

/* ---- Checkins ---- */
export function addCheckin(checkin) {
  setState((s) => ({ checkins: [...s.checkins, checkin] }));
}

/* ---- Treasures ---- */
export function addTreasure(treasure) {
  setState((s) => ({ treasures: [...s.treasures, treasure] }));
}

export function reactToTreasure(id, reaction) {
  setState((s) => ({
    treasures: s.treasures.map((t) =>
      t.id === id
        ? { ...t, reactions: { ...t.reactions, [reaction]: (t.reactions[reaction] || 0) + 1 } }
        : t
    ),
  }));
}

/* ---- Monsters ---- */
export function addMonster(monster) {
  setState((s) => ({ monsters: [...s.monsters, monster] }));
}

export function reactToMonster(id, reaction) {
  setState((s) => ({
    monsters: s.monsters.map((m) =>
      m.id === id
        ? { ...m, reactions: { ...m.reactions, [reaction]: (m.reactions[reaction] || 0) + 1 } }
        : m
    ),
  }));
}

export function selectMonster(id) {
  setState((s) => ({
    monsters: s.monsters.map((m) =>
      m.id === id ? { ...m, selected: !m.selected } : m
    ),
  }));
}

export function prioritizeMonsters() {
  setState((s) => ({
    monsters: [...s.monsters].sort(
      (a, b) => (b.reactions.fire || 0) - (a.reactions.fire || 0)
    ),
  }));
}

/* ---- Solutions ---- */
export function addSolution(solution) {
  setState((s) => ({ solutions: [...s.solutions, solution] }));
}

export function voteSolution(id) {
  setState((s) => ({
    solutions: s.solutions.map((sol) =>
      sol.id === id ? { ...sol, votes: (sol.votes || 0) + 1 } : sol
    ),
  }));
}

/* ---- Missions ---- */
export function addMission(mission) {
  setState((s) => ({ missions: [...s.missions, mission] }));
}

export function removeMission(id) {
  setState((s) => ({ missions: s.missions.filter((m) => m.id !== id) }));
}

/* ---- Reset ---- */
export function resetState() {
  _state = DEFAULT_STATE();
  localStorage.removeItem(STORAGE_KEY);
  notify();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

// 1. Carrega cache local imediatamente (evita tela em branco)
loadFromStorage();

// 2. Conecta ao Firebase em background
initFirebase();
