/**
 * Testes unitários para src/screens/lobby.js
 *
 * Garante que o SM é registrado como presente (joinSession chamado)
 * ao entrar no lobby, corrigindo o bug onde o SM nunca era contabilizado
 * em subscribeParticipants.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// ── Hoisted shared mocks ──────────────────────────────────────────────────────

const { _mocks } = vi.hoisted(() => {
  const _mocks = {
    role: 'scrum_master',
    joinSession: vi.fn().mockResolvedValue(undefined),
    subscribeParticipants: vi.fn().mockReturnValue(() => {}),
    stopHeartbeat: vi.fn(),
    leaveSession: vi.fn(),
    getSessionUrl: vi.fn().mockReturnValue('https://example.com/?s=abc123'),
  };
  return { _mocks };
});

// ── vi.mock (hoisted automaticamente pelo Vitest) ─────────────────────────────

vi.mock('../services/presence.js', () => ({
  joinSession:           _mocks.joinSession,
  subscribeParticipants: _mocks.subscribeParticipants,
  stopHeartbeat:         _mocks.stopHeartbeat,
  leaveSession:          _mocks.leaveSession,
  getSessionUrl:         _mocks.getSessionUrl,
}));

vi.mock('../state/store.js', () => ({
  getState:      vi.fn().mockReturnValue({ sprint: { name: 'Sprint 1', startDate: null, endDate: null }, team: {} }),
  setState:      vi.fn(),
  setPhase:      vi.fn(),
  setLocalPhase: vi.fn(),
  getRole:       () => _mocks.role,
}));

vi.mock('../utils/dom.js', () => ({
  escapeHTML: (s) => String(s ?? ''),
}));

// ── Import após mocks ─────────────────────────────────────────────────────────

import { renderLobby } from '../screens/lobby.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRoot() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="root"></div></body>');
  // Garante que navigator.clipboard existe no ambiente de teste
  Object.defineProperty(dom.window, 'navigator', {
    value: { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } },
    configurable: true,
  });
  return dom.window.document.getElementById('root');
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  _mocks.joinSession.mockResolvedValue(undefined);
  _mocks.subscribeParticipants.mockReturnValue(() => {});
});

// ── Testes ────────────────────────────────────────────────────────────────────

describe('lobby.js — presença do SM', () => {
  it('chama joinSession() quando o SM entra no lobby', () => {
    _mocks.role = 'scrum_master';
    const root = buildRoot();

    renderLobby(root);

    expect(_mocks.joinSession).toHaveBeenCalledTimes(1);
  });

  it('NÃO chama joinSession() quando um membro do time entra no lobby', () => {
    _mocks.role = 'team_member';
    const root = buildRoot();

    renderLobby(root);

    expect(_mocks.joinSession).not.toHaveBeenCalled();
  });
});
