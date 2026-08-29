/**
 * Testes unitários para src/services/reactions.js
 *
 * Usa jsdom localStorage (disponível no ambiente Vitest com jsdom).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { hasReacted, markReacted, unmarkReacted } from '../services/reactions.js';

const SID  = 'aabbcc112233445566778899aabbcc00';
const DEV  = 'device0011aabbcc';
const DEV2 = 'device9900ddeeff';

beforeEach(() => {
  localStorage.clear();
});

describe('hasReacted', () => {
  it('retorna false antes de qualquer marcação', () => {
    expect(hasReacted(SID, 'monsters', 'item1', DEV, 'fire')).toBe(false);
  });

  it('retorna true após markReacted para a mesma combinação', () => {
    markReacted(SID, 'monsters', 'item1', DEV, 'fire');
    expect(hasReacted(SID, 'monsters', 'item1', DEV, 'fire')).toBe(true);
  });

  it('retorna false para outra reação do mesmo item', () => {
    markReacted(SID, 'monsters', 'item1', DEV, 'fire');
    expect(hasReacted(SID, 'monsters', 'item1', DEV, 'eyes')).toBe(false);
  });

  it('retorna false para outro item com a mesma reação', () => {
    markReacted(SID, 'monsters', 'item1', DEV, 'fire');
    expect(hasReacted(SID, 'monsters', 'item2', DEV, 'fire')).toBe(false);
  });

  it('retorna false para outro dispositivo', () => {
    markReacted(SID, 'monsters', 'item1', DEV, 'fire');
    expect(hasReacted(SID, 'monsters', 'item1', DEV2, 'fire')).toBe(false);
  });

  it('retorna false para outra sessão', () => {
    markReacted(SID, 'monsters', 'item1', DEV, 'fire');
    const otherSid = 'ffffffffffffffffffffffffffffffff';
    expect(hasReacted(otherSid, 'monsters', 'item1', DEV, 'fire')).toBe(false);
  });

  it('retorna false para outra coleção', () => {
    markReacted(SID, 'monsters', 'item1', DEV, 'fire');
    expect(hasReacted(SID, 'treasures', 'item1', DEV, 'fire')).toBe(false);
  });
});

describe('markReacted — persiste entre chamadas', () => {
  it('múltiplas reações diferentes ficam todas registradas', () => {
    markReacted(SID, 'monsters', 'item1', DEV, 'fire');
    markReacted(SID, 'monsters', 'item1', DEV, 'eyes');
    markReacted(SID, 'treasures', 'item2', DEV, 'heart');

    expect(hasReacted(SID, 'monsters', 'item1', DEV, 'fire')).toBe(true);
    expect(hasReacted(SID, 'monsters', 'item1', DEV, 'eyes')).toBe(true);
    expect(hasReacted(SID, 'treasures', 'item2', DEV, 'heart')).toBe(true);
    // não contaminam entre si
    expect(hasReacted(SID, 'monsters', 'item2', DEV, 'fire')).toBe(false);
    expect(hasReacted(SID, 'treasures', 'item1', DEV, 'fire')).toBe(false);
  });

  it('idempotente — chamar markReacted duas vezes não duplica entradas', () => {
    markReacted(SID, 'solutions', 'sol1', DEV, 'vote');
    markReacted(SID, 'solutions', 'sol1', DEV, 'vote');
    expect(hasReacted(SID, 'solutions', 'sol1', DEV, 'vote')).toBe(true);
    // confirma que é Set (sem duplicata)
    const raw = JSON.parse(localStorage.getItem('_jornada_reactions') || '[]');
    const key = `${SID}:solutions:sol1:${DEV}:vote`;
    expect(raw.filter((k) => k === key)).toHaveLength(1);
  });
});

describe('unmarkReacted — rollback de marcação', () => {
  it('remove a marcação existente, fazendo hasReacted retornar false', () => {
    markReacted(SID, 'monsters', 'item1', DEV, 'fire');
    expect(hasReacted(SID, 'monsters', 'item1', DEV, 'fire')).toBe(true);

    unmarkReacted(SID, 'monsters', 'item1', DEV, 'fire');
    expect(hasReacted(SID, 'monsters', 'item1', DEV, 'fire')).toBe(false);
  });

  it('não afeta outras marcações ao remover uma', () => {
    markReacted(SID, 'monsters', 'item1', DEV, 'fire');
    markReacted(SID, 'monsters', 'item1', DEV, 'eyes');

    unmarkReacted(SID, 'monsters', 'item1', DEV, 'fire');

    expect(hasReacted(SID, 'monsters', 'item1', DEV, 'fire')).toBe(false);
    expect(hasReacted(SID, 'monsters', 'item1', DEV, 'eyes')).toBe(true);
  });

  it('é seguro chamar em chave inexistente (sem erro)', () => {
    expect(() => unmarkReacted(SID, 'monsters', 'naoexiste', DEV, 'fire')).not.toThrow();
    expect(hasReacted(SID, 'monsters', 'naoexiste', DEV, 'fire')).toBe(false);
  });

  it('permite reagir novamente após unmark (simula retry após falha de rede)', () => {
    markReacted(SID, 'treasures', 'item2', DEV, 'heart');
    unmarkReacted(SID, 'treasures', 'item2', DEV, 'heart');
    // Após rollback, hasReacted deve retornar false permitindo nova tentativa
    expect(hasReacted(SID, 'treasures', 'item2', DEV, 'heart')).toBe(false);
    // Pode ser marcado novamente
    markReacted(SID, 'treasures', 'item2', DEV, 'heart');
    expect(hasReacted(SID, 'treasures', 'item2', DEV, 'heart')).toBe(true);
  });
});
