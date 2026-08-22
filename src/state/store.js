/**
 * Central State Store with LocalStorage persistence
 */

const STORAGE_KEY = 'jornada_sprint_session';

const DEFAULT_STATE = () => ({
  sprint: { name: '', startDate: '', endDate: '' },
  team: { name: '', participantCount: '' },
  currentPhase: 'home',
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

let _state = DEFAULT_STATE();
const _listeners = new Set();

/** Load state from LocalStorage */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      _state = { ...DEFAULT_STATE(), ...parsed };
    }
  } catch (e) {
    console.warn('Could not load saved session:', e);
  }
}

/** Persist current state to LocalStorage */
function saveToStorage() {
  try {
    _state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  } catch (e) {
    console.warn('Could not save session:', e);
  }
}

/** Notify all subscribers */
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

/** Check if a saved session exists */
export function hasSavedSession() {
  return !!localStorage.getItem(STORAGE_KEY);
}

/**
 * Set state with partial update. Persists + notifies.
 */
export function setState(partial) {
  if (typeof partial === 'function') {
    _state = { ..._state, ...partial(_state) };
  } else {
    _state = { ..._state, ...partial };
  }
  saveToStorage();
  notify();
}

/** Navigate to a phase */
export function setPhase(phase) {
  setState({ currentPhase: phase });
}

/** Mark a phase as completed */
export function completePhase(phase) {
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

// Initialize
loadFromStorage();
