/**
 * Central State Store
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
  saveItem,
  patchItem,
  removeItem,
  subscribeSession,
  subscribeCollection,
  increment,
  saveSmProfile,
  upsertSmSession,
} from '../services/firebase.js';
import { getDeviceId } from '../services/presence.js';
import { initAuth, getCurrentUser, onAuthChange } from '../services/auth.js';
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
  smUid:            null,   // uid do Firebase Auth do SM que criou a sessão
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
    const user = getCurrentUser();
    setScalarState({
      smDeviceId: getDeviceId(),
      smUid: user ? user.uid : null,
    });
  }
}

export function isSM() {
  // Se o role foi definido explicitamente nesta sessão de browser,
  // ele tem prioridade sobre o smDeviceId — impede que alguém que
  // criou uma sessão anterior (e tem o smDeviceId salvo) seja tratado
  // como SM quando entra como membro do time pelo link.
  const role = getRole();
  if (role === 'team_member') return false;
  if (role === 'scrum_master') return true;
  // Sem role explícito: fallback pelo smDeviceId (bootstrap do SM autenticado)
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

    // Atualiza o resumo no perfil do SM (se estiver autenticado e for SM)
    _syncSmProfile();
  }

  notify();
}

/**
 * Sincroniza o resumo da sessão atual no perfil do SM autenticado.
 * Chamado de forma assíncrona, sem bloquear o fluxo principal.
 */
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
    }
  } catch (e) {
    console.warn('Could not load session root from Firestore:', e);
  }

  // 2. Carrega e assina subcoleções apenas quando o documento raiz existe.
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

  // 3. Subscription ao doc raiz
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

  // Subcoleções para quem já tinha sessão ao carregar
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

// ── Phase helpers ─────────────────────────────────────────────────────────────

export function setPhase(phase) {
  if (!isSM()) {
    console.warn('[setPhase] bloqueado — somente o Scrum Master pode avançar fases.');
    return;
  }
  const phaseStartedAt = { ..._state.phaseStartedAt, [phase]: new Date().toISOString() };
  setScalarState({ currentPhase: phase, phaseStartedAt });
}

/**
 * Navega localmente para uma fase sem persistir no Firestore e sem checar SM.
 * Usado pelo membro do time para mudar de tela localmente (ex: roleSelect → lobby).
 * Também usado para fases pré-sessão do SM: auth, smDashboard.
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
  sorted.forEach((m, i) => {
    patchItem(_sessionId, 'monsters', m.id, { priorityRank: i }).catch((e) =>
      console.warn('Firestore prioritizeMonsters failed:', e)
    );
  });
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

// ── Reset & Nova sessão ───────────────────────────────────────────────────────

export function resetState() {
  _state = DEFAULT_STATE();
  localStorage.removeItem(STORAGE_KEY);
  notify();
}

/**
 * Inicia uma nova sessão sem limpar o estado do usuário autenticado.
 * Gera um novo sessionId na URL e reseta o estado da sessão.
 * Chamado pelo dashboard do SM ao criar uma nova retrospectiva.
 */
export function startNewSession() {
  // Cancela subscrições da sessão anterior
  _unsubs.forEach((u) => u());
  _unsubs.length = 0;

  // Gera novo sessionId e atualiza a URL
  const newId = generateId();
  const params = new URLSearchParams(window.location.search);
  params.set('s', newId);
  window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  _sessionId = newId;

  // Reseta estado da sessão mas mantém o usuário autenticado
  _state = DEFAULT_STATE();
  localStorage.removeItem(STORAGE_KEY);

  // Grava os campos iniciais do SM no Firestore e define role
  const user = getCurrentUser();
  setScalarState({
    smDeviceId: getDeviceId(),
    smUid:      user ? user.uid : null,
    currentPhase: 'setup',
    createdAt:  new Date().toISOString(),
  });
  sessionStorage.setItem(ROLE_KEY, 'scrum_master');

  // Reabre as subscriptions Firestore para a nova sessão
  initFirebase();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

loadFromStorage();

// Inicializa o Auth ANTES do Firestore para que getCurrentUser() esteja disponível
// quando initFirebase() gravar smUid na sessão.
initAuth().then((user) => {
  // Se o usuário já estava logado ao carregar a página (ex: sessão persistida),
  // e está numa tela pré-sessão, vai direto ao dashboard.
  const preSessionPhases = new Set(['auth', 'home', 'roleSelect']);
  if (user && preSessionPhases.has(_state.currentPhase)) {
    // Salva/atualiza perfil do SM
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

// Escuta mudanças subsequentes de auth (login/logout após o bootstrap)
onAuthChange((user) => {
  const phase = _state.currentPhase;

  if (user) {
    // Usuário acabou de fazer login
    saveSmProfile(user.uid, {
      displayName: user.displayName || '',
      email:       user.email       || '',
      photoURL:    user.photoURL    || '',
    }).catch((e) => console.warn('[store] saveSmProfile failed:', e));

    // Se está em qualquer tela pré-sessão do SM, vai para o dashboard.
    // Inclui 'roleSelect' para cobrir o caso em que o onAuthChange chega
    // antes de o store ter mudado para 'auth'.
    const preSessionPhases = new Set(['auth', 'home', 'roleSelect']);
    if (preSessionPhases.has(phase)) {
      _state = { ..._state, currentPhase: 'smDashboard' };
      notify();
    }
  } else {
    // Usuário acabou de fazer logout
    const smPhases = new Set(['auth', 'smDashboard', 'setup', 'lobby']);
    if (smPhases.has(phase)) {
      _state = { ..._state, currentPhase: 'home' };
      notify();
    }
  }
});
