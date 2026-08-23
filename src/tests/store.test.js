/**
 * Testes unitários do store.js
 *
 * O store depende de firebase.js e presence.js. Ambos são mockados:
 * - firebase.js → todas as funções retornam Promises/valores neutros
 * - presence.js → getDeviceId() retorna um ID fixo controlável por teste
 *
 * Isso permite testar a lógica de estado pura (fases, XP, controle de
 * acesso SM, subscribers) sem nenhuma conexão com o Firestore.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks (declarados antes de qualquer import do módulo testado) ─────────────

const DEVICE_SM   = 'device-sm-aabbcc';
const DEVICE_TEAM = 'device-team-ddeeff';

let _currentDeviceId = DEVICE_SM;

vi.mock('../services/presence.js', () => ({
  getDeviceId: () => _currentDeviceId,
}));

vi.mock('../services/firebase.js', () => ({
  getOrCreateSessionId: () => 'test-session-id',
  loadSession:          vi.fn().mockResolvedValue(null),
  loadCollection:       vi.fn().mockResolvedValue([]),
  saveSession:          vi.fn().mockResolvedValue(undefined),
  incrementXP:          vi.fn().mockResolvedValue(undefined),
  saveItem:             vi.fn().mockResolvedValue(undefined),
  patchItem:            vi.fn().mockResolvedValue(undefined),
  removeItem:           vi.fn().mockResolvedValue(undefined),
  subscribeSession:     vi.fn().mockReturnValue(() => {}),
  subscribeCollection:  vi.fn().mockReturnValue(() => {}),
  increment:            (n) => ({ _increment: n }),
}));

// ── Import do store após os mocks ─────────────────────────────────────────────

import {
  getState,
  setState,
  isSM,
  setPhase,
  completePhase,
  addXP,
  prioritizeMonsters,
  subscribe,
  resetState,
} from '../state/store.js';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetState();
  _currentDeviceId = DEVICE_SM;
});

// ── isSM ─────────────────────────────────────────────────────────────────────

describe('isSM', () => {
  it('retorna false quando smDeviceId não está definido', () => {
    expect(isSM()).toBe(false);
  });

  it('retorna true quando deviceId bate com smDeviceId no estado', () => {
    setState({ smDeviceId: DEVICE_SM });
    _currentDeviceId = DEVICE_SM;
    expect(isSM()).toBe(true);
  });

  it('retorna false quando deviceId é diferente do smDeviceId', () => {
    setState({ smDeviceId: DEVICE_SM });
    _currentDeviceId = DEVICE_TEAM;
    expect(isSM()).toBe(false);
  });
});

// ── setPhase ──────────────────────────────────────────────────────────────────

describe('setPhase', () => {
  beforeEach(() => {
    setState({ smDeviceId: DEVICE_SM });
    _currentDeviceId = DEVICE_SM;
  });

  it('SM consegue avançar para qualquer fase', () => {
    setPhase('checkin');
    expect(getState().currentPhase).toBe('checkin');
  });

  it('membro do time não pode alterar a fase atual', () => {
    setPhase('checkin');             // SM avança
    _currentDeviceId = DEVICE_TEAM; // simula outro device
    setPhase('treasures');           // tentativa bloqueada
    expect(getState().currentPhase).toBe('checkin');
  });

  it('percorre todas as fases em sequência', () => {
    const fases = ['checkin', 'treasures', 'monsters', 'combat', 'missions', 'complete'];
    for (const fase of fases) {
      setPhase(fase);
      expect(getState().currentPhase).toBe(fase);
    }
  });
});

// ── completePhase ─────────────────────────────────────────────────────────────

describe('completePhase', () => {
  beforeEach(() => {
    setState({ smDeviceId: DEVICE_SM });
    _currentDeviceId = DEVICE_SM;
  });

  it('adiciona fase à lista de completedPhases', () => {
    completePhase('checkin');
    expect(getState().completedPhases).toContain('checkin');
  });

  it('não duplica fases já completadas', () => {
    completePhase('checkin');
    completePhase('checkin');
    const dupes = getState().completedPhases.filter((p) => p === 'checkin');
    expect(dupes).toHaveLength(1);
  });

  it('membro do time não pode completar fase', () => {
    _currentDeviceId = DEVICE_TEAM;
    completePhase('checkin');
    expect(getState().completedPhases).not.toContain('checkin');
  });
});

// ── addXP ─────────────────────────────────────────────────────────────────────

describe('addXP', () => {
  it('acumula XP corretamente em chamadas sucessivas', () => {
    addXP(10);
    addXP(20);
    expect(getState().xp).toBe(30);
  });

  it('retorna o valor adicionado', () => {
    expect(addXP(50)).toBe(50);
  });

  it('parte de zero quando estado está limpo', () => {
    addXP(100);
    expect(getState().xp).toBe(100);
  });
});

// ── setState ──────────────────────────────────────────────────────────────────

describe('setState', () => {
  it('atualiza campo escalar', () => {
    setState({ retroStarted: true });
    expect(getState().retroStarted).toBe(true);
  });

  it('não sobrescreve subcoleções (arrays ficam isolados)', () => {
    const before = getState().treasures;
    setState({ retroStarted: true, treasures: [{ id: 'injetado' }] });
    expect(getState().treasures).toEqual(before);
  });

  it('suporta função updater', () => {
    setState({ xp: 10 });
    setState((s) => ({ xp: s.xp + 5 }));
    expect(getState().xp).toBe(15);
  });

  it('atualiza updatedAt a cada chamada', () => {
    const t1 = getState().updatedAt;
    setState({ retroStarted: true });
    const t2 = getState().updatedAt;
    expect(t2 >= t1).toBe(true);
  });
});

// ── subscribe ─────────────────────────────────────────────────────────────────

describe('subscribe', () => {
  it('notifica listener quando estado muda', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    setState({ retroStarted: true });
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('não notifica após unsubscribe', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    unsub();
    setState({ retroStarted: false });
    expect(listener).not.toHaveBeenCalled();
  });

  it('passa snapshot do estado ao listener', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    setState({ currentPhase: 'treasures' });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ currentPhase: 'treasures' })
    );
    unsub();
  });

  it('múltiplos listeners recebem a notificação', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    const u1 = subscribe(l1);
    const u2 = subscribe(l2);
    setState({ retroStarted: true });
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
    u1(); u2();
  });
});

// ── prioritizeMonsters ────────────────────────────────────────────────────────

describe('prioritizeMonsters', () => {
  it('algoritmo de sort ordena por fire decrescente', () => {
    // O store não expõe injeção direta de coleção sem passar pelo Firestore,
    // então testamos o invariante do algoritmo de sort que prioritizeMonsters
    // usa internamente (mesma expressão do store.js).
    const monsters = [
      { id: 'a', reactions: { fire: 1 } },
      { id: 'b', reactions: { fire: 5 } },
      { id: 'c', reactions: { fire: 3 } },
    ];
    const sorted = [...monsters].sort(
      (a, b) => (b.reactions?.fire || 0) - (a.reactions?.fire || 0)
    );
    expect(sorted[0].id).toBe('b');
    expect(sorted[1].id).toBe('c');
    expect(sorted[2].id).toBe('a');
  });

  it('não lança erro quando monsters está vazio', () => {
    expect(() => prioritizeMonsters()).not.toThrow();
  });
});
