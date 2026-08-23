import { describe, it, expect } from 'vitest';
import { calcCheckinStats, getMoodLabel, calcSummaryStats } from '../services/stats.js';

describe('calcCheckinStats', () => {
  it('retorna zeros para array vazio', () => {
    const result = calcCheckinStats([]);
    expect(result.total).toBe(0);
    expect(result.average).toBe(0);
    expect(result.distribution).toEqual({});
  });

  it('calcula média corretamente', () => {
    const checkins = [
      { score: 4, comment: null },
      { score: 2, comment: null },
    ];
    expect(calcCheckinStats(checkins).average).toBe(3);
  });

  it('calcula distribuição corretamente', () => {
    const checkins = [
      { score: 5 }, { score: 5 }, { score: 3 }, { score: 1 },
    ];
    const { distribution } = calcCheckinStats(checkins);
    expect(distribution[5]).toBe(2);
    expect(distribution[3]).toBe(1);
    expect(distribution[1]).toBe(1);
    expect(distribution[2]).toBe(0);
  });

  it('total reflete o número de checkins', () => {
    const checkins = [{ score: 3 }, { score: 4 }, { score: 5 }];
    expect(calcCheckinStats(checkins).total).toBe(3);
  });

  it('média de um único score é o próprio score', () => {
    expect(calcCheckinStats([{ score: 5 }]).average).toBe(5);
  });
});

describe('getMoodLabel', () => {
  const cases = [
    [5.0, 'Excelente 🤩'],
    [4.5, 'Excelente 🤩'],
    [4.0, 'Bom 🙂'],
    [3.5, 'Bom 🙂'],
    [3.0, 'Neutro 😐'],
    [2.5, 'Neutro 😐'],
    [2.0, 'Ruim 😕'],
    [1.5, 'Ruim 😕'],
    [1.0, 'Muito Ruim 😫'],
    [0,   'Muito Ruim 😫'],
  ];

  it.each(cases)('média %.1f → "%s"', (avg, label) => {
    expect(getMoodLabel(avg).label).toBe(label);
  });

  it('retorna um objeto com label e color', () => {
    const result = getMoodLabel(4);
    expect(result).toHaveProperty('label');
    expect(result).toHaveProperty('color');
  });
});

describe('calcSummaryStats', () => {
  const baseState = {
    xp: 150,
    checkins:  [{ score: 4 }, { score: 5 }],
    treasures: [
      { category: 'treasure' },
      { category: 'recognition' },
      { category: 'learning' },
      { category: 'learning' },
    ],
    monsters:  [
      { selected: true,  reactions: {} },
      { selected: false, reactions: {} },
    ],
    solutions: [{ id: 'a' }, { id: 'b' }],
    missions:  [
      { priority: 'high' },
      { priority: 'medium' },
      { priority: 'low' },
    ],
  };

  it('conta tesouros por categoria', () => {
    const stats = calcSummaryStats(baseState);
    expect(stats.treasureCount).toBe(1);
    expect(stats.recognitionCount).toBe(1);
    expect(stats.learningCount).toBe(2);
  });

  it('conta monstros totais e selecionados', () => {
    const stats = calcSummaryStats(baseState);
    expect(stats.monsterCount).toBe(2);
    expect(stats.selectedMonsterCount).toBe(1);
  });

  it('conta missões por prioridade', () => {
    const stats = calcSummaryStats(baseState);
    expect(stats.highPriority).toBe(1);
    expect(stats.medPriority).toBe(1);
    expect(stats.lowPriority).toBe(1);
  });

  it('expõe totalXP do estado', () => {
    expect(calcSummaryStats(baseState).totalXP).toBe(150);
  });

  it('expõe checkinStats calculados', () => {
    const { checkinStats } = calcSummaryStats(baseState);
    expect(checkinStats.total).toBe(2);
    expect(checkinStats.average).toBe(4.5);
  });
});
