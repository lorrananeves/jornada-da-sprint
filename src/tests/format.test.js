import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatXP,
  truncate,
  getScoreEmoji,
  getScoreLabel,
  getPriorityLabel,
  getStrategyLabel,
} from '../utils/format.js';

describe('formatDate', () => {
  it('converte YYYY-MM-DD para DD/MM/YYYY', () => {
    expect(formatDate('2024-03-15')).toBe('15/03/2024');
  });

  it('retorna "—" para string vazia', () => {
    expect(formatDate('')).toBe('—');
  });

  it('retorna "—" para null/undefined', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });
});

describe('formatXP', () => {
  it('formata XP com sufixo', () => {
    expect(formatXP(100)).toContain('XP');
  });

  it('inclui o número', () => {
    expect(formatXP(500)).toContain('500');
  });

  it('lida com zero', () => {
    expect(formatXP(0)).toContain('0');
  });
});

describe('truncate', () => {
  it('não trunca strings curtas', () => {
    expect(truncate('abc', 10)).toBe('abc');
  });

  it('trunca strings longas e adiciona reticências', () => {
    const result = truncate('abcdefghij', 5);
    expect(result).toHaveLength(6); // 5 chars + '…'
    expect(result.endsWith('…')).toBe(true);
  });

  it('string exatamente no limite não é truncada', () => {
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('retorna string vazia para entrada vazia', () => {
    expect(truncate('')).toBe('');
    expect(truncate(null)).toBe('');
    expect(truncate(undefined)).toBe('');
  });
});

describe('getScoreEmoji', () => {
  it('retorna emoji correto para cada score 1-5', () => {
    expect(getScoreEmoji(1)).toBe('😫');
    expect(getScoreEmoji(2)).toBe('😕');
    expect(getScoreEmoji(3)).toBe('😐');
    expect(getScoreEmoji(4)).toBe('🙂');
    expect(getScoreEmoji(5)).toBe('🤩');
  });

  it('retorna "❓" para score inválido', () => {
    expect(getScoreEmoji(0)).toBe('❓');
    expect(getScoreEmoji(6)).toBe('❓');
  });
});

describe('getScoreLabel', () => {
  it('retorna label correto para cada score', () => {
    expect(getScoreLabel(1)).toBe('Muito ruim');
    expect(getScoreLabel(3)).toBe('Neutro');
    expect(getScoreLabel(5)).toBe('Excelente');
  });

  it('retorna string vazia para score inválido', () => {
    expect(getScoreLabel(0)).toBe('');
  });
});

describe('getPriorityLabel', () => {
  it('retorna label em português', () => {
    expect(getPriorityLabel('high')).toBe('Alta');
    expect(getPriorityLabel('medium')).toBe('Média');
    expect(getPriorityLabel('low')).toBe('Baixa');
  });

  it('retorna o valor original para prioridade desconhecida', () => {
    expect(getPriorityLabel('unknown')).toBe('unknown');
  });
});

describe('getStrategyLabel', () => {
  it('retorna label com emoji para cada estratégia', () => {
    expect(getStrategyLabel('prevent')).toContain('Prevenir');
    expect(getStrategyLabel('reduce')).toContain('Reduzir');
    expect(getStrategyLabel('handle')).toContain('Lidar');
  });

  it('retorna o valor original para estratégia desconhecida', () => {
    expect(getStrategyLabel('custom')).toBe('custom');
  });
});
