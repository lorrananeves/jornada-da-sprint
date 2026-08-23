import { describe, it, expect } from 'vitest';
import {
  XP_RULES,
  xpForCheckin,
  xpForTreasure,
  xpForMonster,
  xpForSolution,
  xpForMission,
} from '../services/xp.js';

describe('xpForCheckin', () => {
  it('retorna o valor definido em XP_RULES.CHECKIN', () => {
    expect(xpForCheckin()).toBe(XP_RULES.CHECKIN);
  });

  it('retorna um número positivo', () => {
    expect(xpForCheckin()).toBeGreaterThan(0);
  });
});

describe('xpForTreasure', () => {
  it('retorna XP correto para categoria treasure', () => {
    expect(xpForTreasure('treasure')).toBe(XP_RULES.TREASURE);
  });

  it('retorna XP correto para categoria recognition', () => {
    expect(xpForTreasure('recognition')).toBe(XP_RULES.RECOGNITION);
  });

  it('retorna XP correto para categoria learning', () => {
    expect(xpForTreasure('learning')).toBe(XP_RULES.LEARNING);
  });

  it('usa fallback para categoria desconhecida', () => {
    expect(xpForTreasure('desconhecida')).toBe(XP_RULES.TREASURE);
  });

  it('usa fallback para undefined', () => {
    expect(xpForTreasure(undefined)).toBe(XP_RULES.TREASURE);
  });
});

describe('xpForMonster', () => {
  it('retorna o valor definido em XP_RULES.MONSTER', () => {
    expect(xpForMonster()).toBe(XP_RULES.MONSTER);
  });
});

describe('xpForSolution', () => {
  it('retorna o valor definido em XP_RULES.SOLUTION', () => {
    expect(xpForSolution()).toBe(XP_RULES.SOLUTION);
  });

  it('vale mais que um tesouro (soluções são mais valiosas)', () => {
    expect(xpForSolution()).toBeGreaterThan(xpForTreasure('treasure'));
  });
});

describe('xpForMission', () => {
  it('retorna o valor definido em XP_RULES.MISSION', () => {
    expect(xpForMission()).toBe(XP_RULES.MISSION);
  });

  it('vale mais que uma solução (missões têm maior peso)', () => {
    expect(xpForMission()).toBeGreaterThan(xpForSolution());
  });
});
