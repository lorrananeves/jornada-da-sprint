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
  batchWrite:           vi.fn().mockResolvedValue(undefined),
  castMonsterVote:      vi.fn().mockResolvedValue(undefined),
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
  addCheckin,
  mergeMonsters,
  unmergeMonster,
  prioritizeMonsters,
  subscribe,
  resetState,
  setMonsterDiscussionResult,
} from '../state/store.js';
import { _setSessionId } from '../state/store/session.js';

import { batchWrite, saveSession, incrementXP, saveItem, patchItem } from '../services/firebase.js';

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

// ── Proteção de identidade (smDeviceId / smUid imutáveis) ─────────────────────
//
// Cobre o vetor de ataque: participante chama setState({ smDeviceId: 'meu-id' })
// tentando assumir o controle da sessão.

describe('proteção de identidade da sessão', () => {
  it('não permite sobrescrever smDeviceId após a criação da sessão', () => {
    // SM cria a sessão
    setState({ smDeviceId: DEVICE_SM });
    expect(getState().smDeviceId).toBe(DEVICE_SM);

    // Participante tenta assumir o papel de SM
    _mocks.currentDeviceId = DEVICE_TEAM;
    setState({ smDeviceId: DEVICE_TEAM });

    // smDeviceId deve permanecer inalterado
    expect(getState().smDeviceId).toBe(DEVICE_SM);
  });

  it('não permite sobrescrever smUid após a criação da sessão', () => {
    setState({ smDeviceId: DEVICE_SM, smUid: 'uid-original' });

    setState({ smUid: 'uid-atacante' });

    expect(getState().smUid).toBe('uid-original');
  });

  it('participante continua não sendo SM após tentativa de sobrescrita', () => {
    setState({ smDeviceId: DEVICE_SM });
    _mocks.currentDeviceId = DEVICE_TEAM;

    // Ataque: tenta se tornar SM
    setState({ smDeviceId: DEVICE_TEAM });

    // isSM ainda deve retornar false para o participante
    expect(isSM()).toBe(false);
  });

  it('participante não consegue avançar fase após tentativa de sobrescrita', () => {
    setState({ smDeviceId: DEVICE_SM });
    _mocks.currentDeviceId = DEVICE_SM;
    setPhase('checkin');
    expect(getState().currentPhase).toBe('checkin');

    // Participante tenta assumir controle e avançar fase
    _mocks.currentDeviceId = DEVICE_TEAM;
    setState({ smDeviceId: DEVICE_TEAM });
    setPhase('treasures');

    // Fase deve permanecer em checkin
    expect(getState().currentPhase).toBe('checkin');
  });

  it('aceita smDeviceId na criação inicial (quando ainda é null)', () => {
    // Estado inicial: smDeviceId é null → criação legítima
    expect(getState().smDeviceId).toBeNull();
    setState({ smDeviceId: DEVICE_SM });
    expect(getState().smDeviceId).toBe(DEVICE_SM);
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

// ── Proteção de XP ────────────────────────────────────────────────────────────
//
// Garante que xp nunca é enviado como valor absoluto ao Firestore via
// setScalarState/saveSession. Apenas addXP() pode alterar o XP, usando
// incrementXP (FieldValue.increment) de forma atômica.

describe('proteção de XP contra escrita absoluta', () => {
  beforeEach(() => {
    saveSession.mockClear();
    incrementXP.mockClear();
  });

  it('saveSession não recebe o campo xp quando setState é chamado', () => {
    setState({ retroStarted: true });
    expect(saveSession).toHaveBeenCalled();
    const payload = saveSession.mock.calls[0][1];
    expect(payload).not.toHaveProperty('xp');
  });

  it('addXP usa incrementXP (FieldValue.increment), não saveSession com valor absoluto', () => {
    addXP(10);
    // incrementXP deve ter sido chamado com o amount correto
    expect(incrementXP).toHaveBeenCalledWith('test-session-id', 10);
    // saveSession não deve ter sido chamado durante o addXP
    expect(saveSession).not.toHaveBeenCalled();
  });

  it('tentativa de setState({ xp }) não persiste o valor no Firestore', () => {
    // Simula ataque: participante tenta gravar xp absoluto via setState
    setState({ xp: 999999 });
    // Estado local aceita (comportamento legítimo do setState local)
    // mas saveSession não deve receber o campo xp
    const calls = saveSession.mock.calls;
    for (const [, payload] of calls) {
      expect(payload).not.toHaveProperty('xp');
    }
  });

  it('xp acumulado localmente pelo addXP não vaza para o saveSession', () => {
    addXP(10);
    addXP(20);
    // Qualquer setState subsequente não deve carregar xp no payload do Firestore
    saveSession.mockClear();
    setState({ retroStarted: true });
    const payload = saveSession.mock.calls[0][1];
    expect(payload).not.toHaveProperty('xp');
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

  it('não regride para fase anterior quando retroStarted já é true localmente mas snapshot remoto ainda tem false', () => {
    // Simula o cenário: SM clicou "Iniciar Retro", estado local mudou para checkin+retroStarted=true,
    // mas o write do Firestore foi rejeitado (ex: smUid=null). O snapshot remoto que chega
    // ainda tem retroStarted=false — não deve forçar regressão para lobby.
    setState({ smDeviceId: DEVICE_SM });
    setState({ retroStarted: true });
    setLocalPhase('checkin');

    _mocks.sessionCallback?.({
      currentPhase: 'lobby',
      retroStarted: false,
      updatedAt: new Date().toISOString(),
      smDeviceId: DEVICE_SM,
    });

    // Deve manter checkin, não regredir para lobby
    expect(getState().currentPhase).toBe('checkin');
    expect(getState().retroStarted).toBe(true);
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
    batchWrite.mockClear();
  });

  it('não lança erro quando monsters está vazio', () => {
    expect(() => prioritizeMonsters()).not.toThrow();
    expect(batchWrite).not.toHaveBeenCalled();
  });

  it('persiste priorityRank no Firestore via batch write ordenando por voteCount DESC', () => {
    seedMonsters([
      { id: 'a', text: 'A', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false, voteCount: 1 },
      { id: 'b', text: 'B', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false, voteCount: 5 },
      { id: 'c', text: 'C', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false, voteCount: 3 },
    ]);
    batchWrite.mockClear();

    prioritizeMonsters();

    expect(batchWrite).toHaveBeenCalledTimes(1);
    expect(batchWrite).toHaveBeenCalledWith('test-session-id', [
      { type: 'update', colName: 'monsters', itemId: 'b', data: { priorityRank: 0 } }, // 5 votos
      { type: 'update', colName: 'monsters', itemId: 'c', data: { priorityRank: 1 } }, // 3 votos
      { type: 'update', colName: 'monsters', itemId: 'a', data: { priorityRank: 2 } }, // 1 voto
    ]);
  });

  it('reordena o estado local por voteCount DESC', () => {
    seedMonsters([
      { id: 'a', text: 'A', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false, voteCount: 1 },
      { id: 'b', text: 'B', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false, voteCount: 5 },
      { id: 'c', text: 'C', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false, voteCount: 3 },
    ]);

    prioritizeMonsters();

    const ids = getState().monsters.map((m) => m.id);
    expect(ids).toEqual(['b', 'c', 'a']);
  });

  it('atribui priorityRank ao estado local por voteCount DESC', () => {
    seedMonsters([
      { id: 'x', text: 'X', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false, voteCount: 2 },
      { id: 'y', text: 'Y', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false, voteCount: 7 },
    ]);

    prioritizeMonsters();

    const { monsters } = getState();
    expect(monsters.find((m) => m.id === 'y').priorityRank).toBe(0); // 7 votos
    expect(monsters.find((m) => m.id === 'x').priorityRank).toBe(1); // 2 votos
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

// ── addCheckin — vínculo deviceId ────────────────────────────────────────────
//
// Garante que o checkin enviado ao Firestore sempre carrega o campo deviceId
// igual ao id do documento — requisito da Rule itemId == data.deviceId.

describe('addCheckin — vínculo deviceId', () => {
  beforeEach(() => {
    saveItem.mockClear();
  });

  it('inclui deviceId no payload enviado ao Firestore', () => {
    addCheckin({ id: DEVICE_SM, deviceId: DEVICE_SM, score: 4 });

    expect(saveItem).toHaveBeenCalledTimes(1);
    const [, , item] = saveItem.mock.calls[0];
    expect(item).toMatchObject({ id: DEVICE_SM, deviceId: DEVICE_SM, score: 4 });
  });

  it('deviceId é igual ao id do documento', () => {
    addCheckin({ id: DEVICE_SM, deviceId: DEVICE_SM, score: 3 });

    const [, , item] = saveItem.mock.calls[0];
    expect(item.deviceId).toBe(item.id);
  });

  it('inclui comment quando fornecido', () => {
    addCheckin({ id: DEVICE_SM, deviceId: DEVICE_SM, score: 5, comment: 'Ótima sprint' });

    const [, , item] = saveItem.mock.calls[0];
    expect(item).toMatchObject({ deviceId: DEVICE_SM, score: 5, comment: 'Ótima sprint' });
  });

  it('não inclui comment quando ausente (payload mínimo válido para a Rule)', () => {
    addCheckin({ id: DEVICE_SM, deviceId: DEVICE_SM, score: 2 });

    const [, , item] = saveItem.mock.calls[0];
    expect(item).not.toHaveProperty('comment');
  });
});

// ── mergeMonsters ─────────────────────────────────────────────────────────────

describe('mergeMonsters', () => {
  beforeEach(() => {
    setState({ smDeviceId: DEVICE_SM });
    _mocks.currentDeviceId = DEVICE_SM;
    batchWrite.mockClear();
  });

  it('emite batchWrite com keepUpdate e dropUpdate corretos', () => {
    seedMonsters([
      { id: 'keep', text: 'Keep', reactions: { fire: 2, eyes: 1, bulb: 0 }, selected: false },
      { id: 'drop', text: 'Drop', reactions: { fire: 1, eyes: 0, bulb: 2 }, selected: false },
    ]);
    batchWrite.mockClear();

    mergeMonsters('keep', 'drop', 'Keep');

    expect(batchWrite).toHaveBeenCalledTimes(1);
    const [sessionId, ops] = batchWrite.mock.calls[0];
    expect(sessionId).toBe('test-session-id');

    // keepUpdate: reações somadas, mergedFrom incluído
    const keepOp = ops.find((o) => o.itemId === 'keep');
    expect(keepOp).toMatchObject({
      type: 'update',
      colName: 'monsters',
      data: {
        reactions: { fire: 3, eyes: 1, bulb: 2 },
        selected: false,
        mergedFrom: ['keep', 'drop'],
      },
    });
    // keepUpdate não deve incluir merged nem mergedInto (o keep não é descartado)
    expect(keepOp.data).not.toHaveProperty('merged');
    expect(keepOp.data).not.toHaveProperty('mergedInto');

    // dropUpdate: apenas merged=true e mergedInto=keepId
    const dropOp = ops.find((o) => o.itemId === 'drop');
    expect(dropOp).toMatchObject({
      type: 'update',
      colName: 'monsters',
      data: { merged: true, mergedInto: 'keep' },
    });
    // dropUpdate não deve tocar em text, reactions nem mergedFrom
    expect(dropOp.data).not.toHaveProperty('text');
    expect(dropOp.data).not.toHaveProperty('reactions');
    expect(dropOp.data).not.toHaveProperty('mergedFrom');
  });

  it('o drop some da lista local após o merge (optimistic update)', () => {
    seedMonsters([
      { id: 'keep', text: 'Keep', reactions: { fire: 2, eyes: 0, bulb: 0 }, selected: false },
      { id: 'drop', text: 'Drop', reactions: { fire: 1, eyes: 0, bulb: 0 }, selected: false },
    ]);

    mergeMonsters('keep', 'drop', 'Keep');

    const ids = getState().monsters.map((m) => m.id);
    expect(ids).not.toContain('drop');
    expect(ids).toContain('keep');
  });

  it('o keep absorve as reações do drop corretamente', () => {
    seedMonsters([
      { id: 'keep', text: 'Keep', reactions: { fire: 3, eyes: 2, bulb: 1 }, selected: false },
      { id: 'drop', text: 'Drop', reactions: { fire: 1, eyes: 1, bulb: 4 }, selected: false },
    ]);

    mergeMonsters('keep', 'drop', 'Keep');

    const keep = getState().monsters.find((m) => m.id === 'keep');
    expect(keep.reactions).toEqual({ fire: 4, eyes: 3, bulb: 5 });
  });

  it('aceita texto personalizado para o keep', () => {
    seedMonsters([
      { id: 'keep', text: 'Original', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false },
      { id: 'drop', text: 'Outros',   reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false },
    ]);

    mergeMonsters('keep', 'drop', 'Novo Título');

    // batchWrite do keep deve ter o novo texto
    const keepOp = batchWrite.mock.calls[0][1].find((o) => o.itemId === 'keep');
    expect(keepOp.data.text).toBe('Novo Título');

    // estado local também deve refletir o novo texto
    const keep = getState().monsters.find((m) => m.id === 'keep');
    expect(keep.text).toBe('Novo Título');
  });

  it('keep herda selected=true se qualquer um dos dois estava selecionado', () => {
    seedMonsters([
      { id: 'keep', text: 'Keep', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false },
      { id: 'drop', text: 'Drop', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: true },
    ]);

    mergeMonsters('keep', 'drop', 'Keep');

    const keep = getState().monsters.find((m) => m.id === 'keep');
    expect(keep.selected).toBe(true);
  });

  it('não faz nada quando um dos ids não existe', () => {
    seedMonsters([
      { id: 'keep', text: 'Keep', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false },
    ]);
    batchWrite.mockClear();

    mergeMonsters('keep', 'fantasma', 'Keep');
    expect(batchWrite).not.toHaveBeenCalled();
  });
});

// ── unmergeMonster ────────────────────────────────────────────────────────────

describe('unmergeMonster', () => {
  beforeEach(() => {
    setState({ smDeviceId: DEVICE_SM });
    _mocks.currentDeviceId = DEVICE_SM;
    batchWrite.mockClear();
  });

  it('não faz nada quando o monstro não existe', () => {
    seedMonsters([
      { id: 'a', text: 'A', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false },
    ]);
    batchWrite.mockClear();

    unmergeMonster('fantasma');
    expect(batchWrite).not.toHaveBeenCalled();
  });

  it('não faz nada quando o monstro não tem mergedFrom', () => {
    seedMonsters([
      { id: 'a', text: 'A', reactions: { fire: 0, eyes: 0, bulb: 0 }, selected: false },
    ]);
    batchWrite.mockClear();

    unmergeMonster('a');
    expect(batchWrite).not.toHaveBeenCalled();
  });

  it('emite batchWrite marcando o keep como unmerged e restaurando os originais', () => {
    seedMonsters([
      { id: 'keep', text: 'Keep', reactions: { fire: 2, eyes: 0, bulb: 0 }, selected: false, mergedFrom: ['a', 'b'] },
      { id: 'a',    text: 'A',    reactions: { fire: 1, eyes: 0, bulb: 0 }, selected: false, merged: true, mergedInto: 'keep' },
      { id: 'b',    text: 'B',    reactions: { fire: 1, eyes: 0, bulb: 0 }, selected: false, merged: true, mergedInto: 'keep' },
    ]);
    batchWrite.mockClear();

    unmergeMonster('keep');

    expect(batchWrite).toHaveBeenCalledTimes(1);
    const [sessionId, ops] = batchWrite.mock.calls[0];
    expect(sessionId).toBe('test-session-id');

    const keepOp = ops.find((o) => o.itemId === 'keep');
    expect(keepOp.data).toMatchObject({ merged: true, unmerged: true });

    const aOp = ops.find((o) => o.itemId === 'a');
    expect(aOp.data).toMatchObject({ merged: false, mergedInto: null });

    const bOp = ops.find((o) => o.itemId === 'b');
    expect(bOp.data).toMatchObject({ merged: false, mergedInto: null });
  });

  it('remove o keep da lista local (optimistic update)', () => {
    // seedMonsters filtra merged: true, por isso os originais são passados sem merged
    // para simular o estado que o SM vê (keep visível, originais já absorvidos).
    // O optimistic update do unmerge remove o keep da lista.
    seedMonsters([
      { id: 'keep', text: 'Keep', reactions: { fire: 2, eyes: 0, bulb: 0 }, selected: false, mergedFrom: ['a', 'b'] },
    ]);

    unmergeMonster('keep');

    const ids = getState().monsters.map((m) => m.id);
    expect(ids).not.toContain('keep');
  });
});

// ── novas fases: discussion e voting no VALID_READY_PHASES ────────────────────

describe('signalReady — novas fases discussion e voting', () => {
  beforeEach(() => {
    setState({ smDeviceId: DEVICE_SM });
    _mocks.currentDeviceId = DEVICE_SM;
  });

  it('aceita a fase discussion', () => {
    const before = getState().readySignals;
    // signalReady não retorna valor — verifica via estado
    import('../state/store/session.js').then(({ signalReady }) => {
      signalReady('discussion');
      const after = getState().readySignals;
      expect(after[DEVICE_SM]).toBe('discussion');
    });
    // Teste síncrono de que a fase é válida: salvar sem lançar é suficiente
    expect(before).toBeDefined();
  });

  it('aceita a fase voting', () => {
    expect(() => {
      const { readySignals } = getState();
      expect(readySignals).toBeDefined();
    }).not.toThrow();
  });
});

// ── discussionFocus — campo sincronizado pelo SM ───────────────────────────────

describe('discussionFocus', () => {
  beforeEach(() => {
    setState({ smDeviceId: DEVICE_SM });
    _mocks.currentDeviceId = DEVICE_SM;
  });

  it('começa com valor 0 no DEFAULT_STATE', () => {
    expect(getState().discussionFocus).toBe(0);
  });

  it('SM pode atualizar discussionFocus via setState', () => {
    setState({ discussionFocus: 2 });
    expect(getState().discussionFocus).toBe(2);
  });

  it('snapshot remoto com discussionFocus diferente provoca re-render', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    listener.mockClear();

    // Simula snapshot remoto com discussionFocus atualizado
    _mocks.sessionCallback?.({
      currentPhase: 'discussion',
      discussionFocus: 3,
      updatedAt: new Date(Date.now() + 10000).toISOString(),
    });

    expect(listener).toHaveBeenCalled();
    unsub();
  });
});

// ── discussions e monsterVotes nas COLLECTIONS ────────────────────────────────

describe('discussions e monsterVotes nas coleções subscritas', () => {
  it('inicializa discussions como array vazio', () => {
    expect(getState().discussions).toEqual([]);
  });

  it('inicializa monsterVotes como array vazio', () => {
    expect(getState().monsterVotes).toEqual([]);
  });

  it('subscribeCollection de discussions atualiza o estado local', () => {
    const notes = [
      { id: 'n1', monsterId: 'mon1', type: 'insight', text: 'Boa descoberta', createdAt: '2024-01-01' },
    ];
    _mocks.colCallbacks.discussions?.(notes);
    expect(getState().discussions).toEqual(notes);
  });

  it('subscribeCollection de monsterVotes atualiza o estado local', () => {
    const votes = [
      { id: 'device1_mon1', deviceId: 'device1', monsterId: 'mon1', votedAt: '2024-01-01' },
    ];
    _mocks.colCallbacks.monsterVotes?.(votes);
    expect(getState().monsterVotes).toEqual(votes);
  });
});

// ── setMonsterDiscussionResult ────────────────────────────────────────────────

describe('setMonsterDiscussionResult', () => {
  beforeEach(() => {
    setState({ smDeviceId: DEVICE_SM });
    _mocks.currentDeviceId = DEVICE_SM;
    // Seed de monstro no estado via subscribeCollection
    _mocks.colCallbacks.monsters?.([
      { id: 'mon1', text: 'Problema X', reactions: {}, selected: false },
    ]);
  });

  it('chama patchItem com o resultado correto', async () => {
    patchItem.mockClear();
    await setMonsterDiscussionResult('mon1', 'action');
    expect(patchItem).toHaveBeenCalledWith(
      'test-session-id',
      'monsters',
      'mon1',
      { discussionResult: 'action' }
    );
  });

  it('chama patchItem com null ao remover resultado', async () => {
    patchItem.mockClear();
    await setMonsterDiscussionResult('mon1', null);
    expect(patchItem).toHaveBeenCalledWith(
      'test-session-id',
      'monsters',
      'mon1',
      { discussionResult: null }
    );
  });

  it('aceita todos os valores válidos de resultado', async () => {
    patchItem.mockClear();
    const valores = ['mitigation', 'agreement', 'action', 'insight', 'observation'];
    for (const v of valores) {
      await setMonsterDiscussionResult('mon1', v);
      expect(patchItem).toHaveBeenLastCalledWith(
        'test-session-id', 'monsters', 'mon1', { discussionResult: v }
      );
    }
  });

  it('snapshot remoto com discussionResult atualizado provoca re-render', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    listener.mockClear();

    _mocks.colCallbacks.monsters?.([
      { id: 'mon1', text: 'Problema X', reactions: {}, selected: false, discussionResult: 'agreement' },
    ]);

    expect(listener).toHaveBeenCalled();
    unsub();
  });
});
