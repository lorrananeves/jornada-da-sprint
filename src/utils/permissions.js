/**
 * permissions.js — regras de permissão centralizadas da aplicação
 *
 * Princípio:
 *   Participante  = cria conteúdo (monstros, tesouros, soluções, check-in)
 *   Time          = decide coletivamente (reações, votos)
 *   Scrum Master  = facilita a dinâmica e controla ações destrutivas/organizacionais
 *
 * Ações destrutivas ou que alteram o trabalho coletivo são exclusivas do SM:
 *   - Selecionar / desselecionar monstros para combate
 *   - Mesclar monstros
 *   - Priorizar monstros automaticamente
 *   - Criar, editar e remover missões
 *   - Transformar solução em missão
 *   - Remover itens do parking lot
 *   - Avançar / encerrar fases (já garantido em setPhase/completePhase no store)
 *   - Controlar timer (já garantido em phaseTimer.js)
 *
 * Qualquer participante pode:
 *   - Adicionar monstros, tesouros, check-in e soluções
 *   - Reagir a monstros e tesouros
 *   - Votar em soluções
 *   - Adicionar itens ao parking lot
 *   - Sinalizar "Terminei essa parte"
 */

import { isSM } from '../state/store.js';

// ── Monstros ──────────────────────────────────────────────────────────────────

/** Somente o SM pode selecionar/desselecionar monstros para combate. */
export const canSelectMonster    = () => isSM();

/** Somente o SM pode mesclar monstros. */
export const canMergeMonsters    = () => isSM();

/** Somente o SM pode priorizar monstros automaticamente. */
export const canPrioritizeMonsters = () => isSM();

// ── Missões ───────────────────────────────────────────────────────────────────

/** Somente o SM pode criar missões. */
export const canCreateMission    = () => isSM();

/** Somente o SM pode remover missões. */
export const canRemoveMission    = () => isSM();

/** Somente o SM pode transformar uma solução em missão. */
export const canConvertToMission = () => isSM();

// ── Parking Lot ───────────────────────────────────────────────────────────────

/** Somente o SM pode remover itens do parking lot. */
export const canRemoveParkingItem = () => isSM();
