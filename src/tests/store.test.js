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

// ── Hoisted shared state (disponível dentro de vi.mock antes dos imports) ─────

const { _mocks } = vi.hoisted(() => {
  const _mocks = {
    currentDeviceId: 'device-sm-aabbcc',
    // Captura callbacks registados pelo store em subscribeCollection, por coleção.
    colCallbacks: {},
    // Captura o callback de subscribeSession para disparar snapshots nos testes.
    sessionCallback: null,
  };
  return { _mocks };
});

// ── Mocks (declarados antes de qualquer import do módulo testado) ─────────────

const DEVICE_SM   = 'device-sm-aabbcc';
const DEVICE_TEAM = 'device-team-ddeeff';

vi.mock('../services/presence.js', () => ({
  getDeviceId: () => _mocks.currentDeviceId,
}));

vi.mock('../services/firebase.js', () => ({
  getOrCreateSessionId: () => 'test-session-id',
  generateId:           () => 'new-generated-id',
  loadSession:          vi.fn().mockResolvedValue({ currentPhase: 'home', updatedAt: '1970-01-01T00:00:00.000Z' }),
  loadCollection:       vi.fn().mockResolvedValue([]),
  saveSession:          vi.fn().mockResolvedValue(undefined),
  incrementXP:          vi.fn().mockResolvedValue(undefined),
  saveItem:             vi.fn().mockResolvedValue(undefined),
  patchItem:            vi.fn().mockResolvedValue(undefined),
  removeItem:           vi.fn().mockResolvedValue(undefined),
  subscribeSession:     vi.fn().mockImplementation((_, cb) => {
    _mocks.sessionCallback = cb;
    return () => {};
  }),
  subscribeCollection:  vi.fn().mockImplementation((_, col, cb) => {
    _mocks.colCallbacks[col] = cb;
    return () => {};
  }),
  increment:            (n) => ({ _increment: n }),
  saveSmProfile:        vi.fn().mockResolvedValue(undefined),
  upsertSmSession:      vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/auth.js', () => ({
  initAuth:       vi.fn().mockResolvedValue(null),
  getCurrentUser: vi.fn().mockReturnValue(null),
  onAuthChange:   vi.fn().mockReturnValue(() => {}),
}));

// ── Import do store após os mocks ─────────────────────────────────────────────

import {
  getState,
  setState,
  isSM,
  setPhase,
  setLocalPhase,
  completePhase,
  addXP,
  prioritizeMonsters,
  subscribe,
  resetState,
} from '../state/store.js';
import { _setSessionId } from '../state/store/session.js';

import { patchItem } from '../services/firebase.js';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetState();
  // Restaura o sessionId após resetState() zerá-lo, para que testes que
  // dependem de writes no Firestore continuem funcionando
  _setSessionId('test-session-id');
  _mocks.currentDeviceId = DEVICE_SM;
});

// ── isSM ─────────────────────────────────────────────────────────────────────

describe('isSM', () => {
  it('retorna false quando smDeviceId não está definido', () => {
    expect(isSM()).toBe(false);
  });

  it('retorna true quando deviceId bate com smDeviceId no estado', () => {
    setState({ smDeviceId: DEVICE_SM });
    _mocks.currentDeviceId = DEVICE_SM;
    expect(isSM()).toBe(true);
  });

  it('retorna false quando deviceId é diferente do smDeviceId', () => {
    setState({ smDeviceId: DEVICE_SM });
    _mocks.currentDeviceId = DEVICE_TEAM;
    expect(isSM()).toBe(false);
  });
});

// ── setPhase ──────────────────────────────────────────────────────────────────

describe('setPhase', () => {
  beforeEach(() => {
    setState({ smDeviceId: DEVICE_SM });
    _mocks.currentDeviceId = DEVICE_SM;
  });

  it('SM consegue avançar para qualquer fase', () => {
    setPhase('checkin');
    expect(getState().currentPhase).toBe('checkin');
  });

  it('membro do time não pode alterar a fase atual', () => {
    setPhase('checkin');             // SM avança
    _mocks.currentDeviceId = DEVICE_TEAM; // simula outro device
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
    _mocks.currentDeviceId = DEVICE_SM;
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
    _mocks.currentDeviceId = DEVICE_TEAM;
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

  it('preenche updatedAt após a primeira chamada', () => {
    expect(getState().updatedAt).toBeNull();
    setState({ retroStarted: true });
    expect(getState().updatedAt).not.toBeNull();
    expect(typeof getState().updatedAt).toBe('string');
  });
});


// ── subscribeSession guard (roleSelect + lobby) ───────────────────────────────

describe('subscribeSession — guard de fase local', () => {
  it('não sobrescreve currentPhase quando membro está em roleSelect', () => {
    // Simula membro: estado inicial em roleSelect (setLocalPhase não grava updatedAt)
    setLocalPhase('roleSelect');
    expect(getState().currentPhase).toBe('roleSelect');

    // SM avança para checkin — subscribeSession do membro recebe esse snapshot
    _mocks.sessionCallback?.({
      currentPhase: 'checkin',
      updatedAt: new Date().toISOString(),
      smDeviceId: DEVICE_SM,
    });

    // O membro deve permanecer em roleSelect até clicar no botão de papel
    expect(getState().currentPhase).toBe('roleSelect');
  });

  it('não sobrescreve currentPhase quando membro está em lobby e retro ainda não começou', () => {
    // Membro escolheu papel e está no lobby aguardando o SM iniciar
    setLocalPhase('lobby');

    // SM ainda está no setup (retroStarted ausente/false no snapshot)
    _mocks.sessionCallback?.({
      currentPhase: 'setup',
      retroStarted: false,
      updatedAt: new Date().toISOString(),
      smDeviceId: DEVICE_SM,
    });

    // Membro deve permanecer no lobby de espera
    expect(getState().currentPhase).toBe('lobby');
  });

  it('aceita mudança de fase quando SM inicia a retro (retroStarted=true)', () => {
    // Membro está no lobby
    setLocalPhase('lobby');

    // SM inicia a retro — snapshot chega com retroStarted=true e currentPhase=checkin
    _mocks.sessionCallback?.({
      currentPhase: 'checkin',
      retroStarted: true,
      updatedAt: new Date().toISOString(),
      smDeviceId: DEVICE_SM,
    });

    // Agora deve seguir o SM para checkin
    expect(getState().currentPhase).toBe('checkin');
  });

  it('aceita mudança de fase quando membro NÃO está em roleSelect nem lobby', () => {
    // Membro já está na retro em andamento
    setLocalPhase('checkin');

    _mocks.sessionCallback?.({
      currentPhase: 'treasures',
      retroStarted: true,
      updatedAt: new Date().toISOString(),
      smDeviceId: DEVICE_SM,
    });

    // Segue o SM para tesouros
    expect(getState().currentPhase).toBe('treasures');
  });

  it('aceita mudança de fase mesmo quando dois snapshots têm o mesmo updatedAt', () => {
    // Simula o bug: completePhase + setPhase chamados no mesmo milissegundo
    // geram o mesmo updatedAt no segundo snapshot
    const sameTimestamp = '2025-01-01T12:00:00.000Z';

    // Membro recebe primeiro snapshot (completedPhases atualizado, currentPhase=checkin)
    setLocalPhase('checkin');
    _mocks.sessionCallback?.({
      currentPhase: 'checkin',
      completedPhases: ['checkin'],
      retroStarted: true,
      updatedAt: sameTimestamp,
      smDeviceId: DEVICE_SM,
    });
    expect(getState().currentPhase).toBe('checkin');

    // Segundo snapshot chega com mesmo updatedAt mas com currentPhase mudado
    _mocks.sessionCallback?.({
      currentPhase: 'treasures',
      completedPhases: ['checkin'],
      retroStarted: true,
      updatedAt: sameTimestamp,
      smDeviceId: DEVICE_SM,
    });

    // Deve aceitar porque a fase mudou, mesmo com updatedAt igual
    expect(getState().currentPhase).toBe('treasures');
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

// Helper: injeta monstros no estado via o callback capturado de subscribeCollection,
// simulando uma atualização em tempo real do Firestore.
function seedMonsters(monsters) {
  _mocks.colCallbacks.monsters?.(monsters);
}

describe('prioritizeMonsters', () => {
  beforeEach(() => {
    setState({ smDeviceId: DEVICE_SM });
    _mocks.currentDeviceId = DEVICE_SM;
    patchItem.mockClear();
  });

  it('não lança erro quando monsters está vazio', () => {
    expect(() => prioritizeMonsters()).not.toThrow();
    expect(patchItem).not.toHaveBeenCalled();
  });

  it('persiste priorityRank no Firestore em ordem fire decrescente', () => {
    seedMonsters([
      { id: 'a', text: 'A', reactions: { fire: 1, eyes: 0, bulb: 0 }, selected: false },
      { id: 'b', text: 'B', reactions: { fire: 5, eyes: 0, bulb: 0 }, selected: false },
      { id: 'c', text: 'C', reactions: { fire: 3, eyes: 0, bulb: 0 }, selected: false },
    ]);
    patchItem.mockClear(); // descarta os calls do seedMonsters se houver

    prioritizeMonsters();

    // Deve ter chamado patchItem para cada monstro com o campo priorityRank
    expect(patchItem).toHaveBeenCalledTimes(3);
    expect(patchItem).toHaveBeenCalledWith('test-session-id', 'monsters', 'b', { priorityRank: 0 });
    expect(patchItem).toHaveBeenCalledWith('test-session-id', 'monsters', 'c', { priorityRank: 1 });
    expect(patchItem).toHaveBeenCalledWith('test-session-id', 'monsters', 'a', { priorityRank: 2 });
  });

  it('reordena o estado local na mesma ordem', () => {
    seedMonsters([
      { id: 'a', text: 'A', reactions: { fire: 1, eyes: 0, bulb: 0 }, selected: false },
      { id: 'b', text: 'B', reactions: { fire: 5, eyes: 0, bulb: 0 }, selected: false },
      { id: 'c', text: 'C', reactions: { fire: 3, eyes: 0, bulb: 0 }, selected: false },
    ]);

    prioritizeMonsters();

    const ids = getState().monsters.map((m) => m.id);
    expect(ids).toEqual(['b', 'c', 'a']);
  });

  it('atribui priorityRank ao estado local', () => {
    seedMonsters([
      { id: 'x', text: 'X', reactions: { fire: 2, eyes: 0, bulb: 0 }, selected: false },
      { id: 'y', text: 'Y', reactions: { fire: 7, eyes: 0, bulb: 0 }, selected: false },
    ]);

    prioritizeMonsters();

    const { monsters } = getState();
    expect(monsters.find((m) => m.id === 'y').priorityRank).toBe(0);
    expect(monsters.find((m) => m.id === 'x').priorityRank).toBe(1);
  });

  it('ordena por priorityRank ao receber snapshot remoto do Firestore', () => {
    // Simula o SM ter executado prioritizeMonsters — Firestore entrega com ranks
    seedMonsters([
      { id: 'a', text: 'A', reactions: { fire: 1 }, selected: false, priorityRank: 2 },
      { id: 'b', text: 'B', reactions: { fire: 5 }, selected: false, priorityRank: 0 },
      { id: 'c', text: 'C', reactions: { fire: 3 }, selected: false, priorityRank: 1 },
    ]);

    const ids = getState().monsters.map((m) => m.id);
    expect(ids).toEqual(['b', 'c', 'a']);
  });
});
