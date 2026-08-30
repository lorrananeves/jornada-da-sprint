/**
 * permissions.js — regras de permissão centralizadas da aplicação
 *
 * Princípio:
 *   Participante  = cria conteúdo (monstros, tesouros, check-in) e vota
 *   Time          = decide coletivamente (reações, votos de monstros)
 *   Scrum Master  = facilita a dinâmica e controla ações destrutivas/organizacionais
 *
 * Ações exclusivas do SM:
 *   - Selecionar / desselecionar monstros (legado)
 *   - Mesclar, desfazer merge, renomear e excluir monstros
 *   - Priorizar/ordenar monstros por votos
 *   - Gerenciar notas de discussão (adicionar, editar, excluir)
 *   - Controlar o foco da discussão (qual monstro está em pauta)
 *   - Criar, editar e remover missões
 *   - Transformar ação em missão
 *   - Remover itens do parking lot
 *   - Avançar / encerrar fases (já garantido em setPhase/completePhase no store)
 *   - Controlar timer (já garantido em phaseTimer.js)
 *
 * Qualquer participante pode:
 *   - Adicionar monstros, tesouros, check-in
 *   - Reagir a monstros e tesouros
 *   - Votar em monstros (até 3 votos, fase de priorização)
 *   - Adicionar itens ao parking lot
 *   - Sinalizar "Terminei essa parte"
 */

import { isSM } from '../state/store.js';

// ── Monstros ──────────────────────────────────────────────────────────────────

/** Somente o SM pode selecionar/desselecionar monstros (legado — mantido para sessões antigas). */
export const canSelectMonster    = () => isSM();

/** Somente o SM pode mesclar monstros. */
export const canMergeMonsters    = () => isSM();

/** Somente o SM pode desfazer merge de monstros. */
export const canUnmergeMonster   = () => isSM();

/** Somente o SM pode renomear monstros. */
export const canRenameMonster    = () => isSM();

/** Somente o SM pode excluir monstros. */
export const canDeleteMonster    = () => isSM();

/** Somente o SM pode priorizar/ordenar monstros por votos. */
export const canPrioritizeMonsters = () => isSM();

// ── Discussão ─────────────────────────────────────────────────────────────────

/**
 * Somente o SM pode gerenciar notas de discussão.
 * Participantes visualizam as notas em modo somente-leitura.
 * Notas não geram XP — são ferramentas de facilitação.
 */
export const canManageDiscussionNotes = () => isSM();

/**
 * Somente o SM controla qual monstro está em foco na discussão.
 * O foco é sincronizado em tempo real para todos os participantes.
 */
export const canSetDiscussionFocus = () => isSM();

/**
 * Somente o SM pode definir, editar ou remover o resultado de uma discussão.
 * Participantes veem o resultado em modo somente-leitura.
 */
export const canSetDiscussionResult = () => isSM();

// ── Votação de monstros ───────────────────────────────────────────────────────

/**
 * Qualquer participante pode votar em monstros durante a fase de priorização.
 * Limite: 3 votos por dispositivo, 1 voto por monstro.
 */
export const canVoteOnMonster = () => true;

// ── Missões ───────────────────────────────────────────────────────────────────

/** Somente o SM pode criar missões. */
export const canCreateMission    = () => isSM();

/** Somente o SM pode remover missões. */
export const canRemoveMission    = () => isSM();

/** Somente o SM pode transformar uma ação em missão. */
export const canConvertToMission = () => isSM();

// ── Parking Lot ───────────────────────────────────────────────────────────────

/** Somente o SM pode remover itens do parking lot. */
export const canRemoveParkingItem = () => isSM();
