/**
 * Export Service
 *
 * exportAsPDF  — PDF com texto nativo via jsPDF (sem html2canvas)
 * exportAsPNG  — captura de tela via html2canvas (inalterado)
 */

// ─── PNG (mantido como antes) ────────────────────────────────────────────────

/**
 * Capture a DOM element as a canvas
 * @param {HTMLElement} el
 */
async function captureElement(el) {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(el, {
    backgroundColor: '#161b22',
    scale: 2,
    useCORS: true,
    logging: false,
  });
  return canvas;
}

/**
 * Download the report element as a PNG image
 * @param {HTMLElement} el
 * @param {string} filename
 */
export async function exportAsPNG(el, filename = 'jornada-sprint-relatorio.png') {
  const canvas = await captureElement(el);
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ─── PDF com texto nativo ─────────────────────────────────────────────────────

const PAGE_W   = 595;   // A4 largura em pontos
const PAGE_H   = 842;   // A4 altura em pontos
const MARGIN   = 40;    // margem horizontal e vertical
const LINE_W   = PAGE_W - MARGIN * 2;  // largura da área de texto (515pt)
const FOOTER_H = 20;    // altura reservada para rodapé

// Paleta de cores (RGB 0-255)
const C = {
  white:       [255, 255, 255],
  bg:          [ 22,  27,  34],   // #161b22
  surface:     [ 33,  38,  45],   // #21262d
  border:      [ 48,  54,  61],   // #30363d
  text:        [230, 237, 243],   // #e6edf3
  muted:       [139, 148, 158],   // #8b949e
  accent:      [ 88, 166, 255],   // #58a6ff
  success:     [ 63, 185, 119],   // #3fb977
  danger:      [248,  81,  73],   // #f85149
  info:        [ 88, 166, 255],
  purple:      [188, 140, 255],   // #bc8cff
  yellow:      [210, 153,  34],   // #d29922
};

/**
 * Retorna um jsPDF carregado via import dinâmico.
 * Armazena em cache para não re-importar em cada chamada.
 */
async function loadJsPDF() {
  if (!window.__jspdf_module_cache__) {
    window.__jspdf_module_cache__ = await import('jspdf');
  }
  return window.__jspdf_module_cache__;
}

/**
 * Quebra `text` em linhas que caibam em `maxWidth` pontos,
 * usando a largura de caractere aproximada da fonte atual.
 * @param {jsPDF} pdf
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
function splitLines(pdf, text, maxWidth) {
  return pdf.splitTextToSize(String(text ?? ''), maxWidth);
}

/**
 * Remove emojis de uma string para não causar erros de glyph na fonte
 * padrão do jsPDF (helvetica não contém tabela emoji).
 * Substitui cada emoji por um espaço para não colar palavras.
 * @param {string} str
 * @returns {string}
 */
function stripEmoji(str) {
  return String(str ?? '')
    .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Classe auxiliar que rastreia o cursor Y e controla quebra de página.
 */
class Cursor {
  constructor(pdf) {
    this.pdf   = pdf;
    this.y     = MARGIN;
    this.page  = 1;
  }

  /** Garante que há pelo menos `needed` pontos antes do rodapé. */
  ensure(needed) {
    if (this.y + needed > PAGE_H - MARGIN - FOOTER_H) {
      this.pdf.addPage();
      this.page++;
      this.y = MARGIN;
    }
  }

  /** Avança o cursor em `delta` pontos. */
  advance(delta) { this.y += delta; }
}

/**
 * Desenha uma linha horizontal decorativa.
 */
function hRule(pdf, y, color = C.border) {
  pdf.setDrawColor(...color);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
}

/**
 * Escreve um título de seção com fundo preenchido.
 */
function sectionTitle(pdf, cur, label) {
  cur.ensure(24);
  pdf.setFillColor(...C.surface);
  pdf.rect(MARGIN, cur.y, LINE_W, 18, 'F');
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.accent);
  pdf.text(stripEmoji(label), MARGIN + 8, cur.y + 12);
  cur.advance(22);
}

/**
 * Escreve um parágrafo de texto simples com quebra automática de linha.
 * Retorna a quantidade de pontos consumidos.
 */
function paragraph(pdf, cur, text, opts = {}) {
  const {
    fontSize   = 9,
    color      = C.text,
    fontStyle  = 'normal',
    indent     = 0,
    lineHeight = 13,
  } = opts;

  const lines = splitLines(pdf, stripEmoji(text), LINE_W - indent);
  cur.ensure(lines.length * lineHeight + 4);

  pdf.setFontSize(fontSize);
  pdf.setFont('helvetica', fontStyle);
  pdf.setTextColor(...color);

  for (const line of lines) {
    pdf.text(line, MARGIN + indent, cur.y);
    cur.advance(lineHeight);
  }
}

/**
 * Bullet com prefixo fixo e texto com quebra de linha.
 */
function bullet(pdf, cur, prefix, text, opts = {}) {
  const { color = C.text, indent = 8, lineHeight = 13, fontSize = 9 } = opts;

  pdf.setFontSize(fontSize);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...color);

  const maxW = LINE_W - indent - 12;
  const lines = splitLines(pdf, stripEmoji(text), maxW);

  cur.ensure(lines.length * lineHeight + 4);

  // Prefixo na primeira linha
  pdf.text(prefix, MARGIN + indent, cur.y);
  for (let i = 0; i < lines.length; i++) {
    pdf.text(lines[i], MARGIN + indent + 12, cur.y);
    cur.advance(lineHeight);
  }
}

/**
 * Desenha um retângulo de estatística (valor + rótulo).
 */
function statBox(pdf, x, y, w, h, value, label, valueColor = C.accent) {
  pdf.setFillColor(...C.surface);
  pdf.roundedRect(x, y, w, h, 3, 3, 'F');
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...valueColor);
  pdf.text(String(value), x + w / 2, y + h / 2 - 2, { align: 'center' });
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.muted);
  pdf.text(stripEmoji(label), x + w / 2, y + h / 2 + 10, { align: 'center' });
}

/**
 * Gera e baixa o relatório como PDF com texto nativo.
 *
 * @param {object} state   — estado completo do app (getState())
 * @param {string} filename
 */
export async function exportAsPDF(state, filename = 'jornada-sprint-relatorio.pdf') {
  const { jsPDF } = await loadJsPDF();

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const cur = new Cursor(pdf);

  const { sprint, team, treasures, monsters, solutions, missions, checkins } = state;

  // Importa helpers de formatação inline para não criar dependência circular
  const { calcSummaryStats, getMoodLabel } = await import('./stats.js');
  const { formatDate, formatISO, formatXP, getScoreEmoji, getPriorityLabel, getStrategyLabel } = await import('../utils/format.js');

  const stats = calcSummaryStats(state);
  const mood  = getMoodLabel(stats.checkinStats.average);

  // ── Fundo da página ────────────────────────────────────────────────────────
  const totalPages = () => pdf.getNumberOfPages();

  function fillBackground() {
    for (let p = 1; p <= totalPages(); p++) {
      pdf.setPage(p);
      pdf.setFillColor(...C.bg);
      pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');
    }
  }

  // ── CABEÇALHO ─────────────────────────────────────────────────────────────
  cur.advance(8);
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.accent);
  pdf.text('JORNADA DA SPRINT', PAGE_W / 2, cur.y, { align: 'center' });
  cur.advance(22);

  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.text);
  pdf.text(stripEmoji(sprint.name || 'Retrospectiva'), PAGE_W / 2, cur.y, { align: 'center' });
  cur.advance(16);

  if (team.name) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.muted);
    const teamInfo = [
      team.name ? `Time: ${team.name}` : '',
      team.participantCount ? `${team.participantCount} participante${team.participantCount !== 1 ? 's' : ''}` : '',
    ].filter(Boolean).join('  ·  ');
    pdf.text(stripEmoji(teamInfo), PAGE_W / 2, cur.y, { align: 'center' });
    cur.advance(13);
  }

  if (sprint.startDate || sprint.endDate) {
    pdf.setFontSize(8.5);
    pdf.setTextColor(...C.muted);
    pdf.text(
      `${formatDate(sprint.startDate)} → ${formatDate(sprint.endDate)}`,
      PAGE_W / 2, cur.y, { align: 'center' }
    );
    cur.advance(13);
  }

  pdf.setFontSize(7.5);
  pdf.setTextColor(...C.muted);
  pdf.text(`Gerado em ${formatISO(new Date().toISOString())}`, PAGE_W / 2, cur.y, { align: 'center' });
  cur.advance(14);

  hRule(pdf, cur.y);
  cur.advance(14);

  // ── RESULTADO GERAL ────────────────────────────────────────────────────────
  sectionTitle(pdf, cur, 'Resultado Geral');

  const boxW = 155;
  const boxH = 52;
  const boxGap = (LINE_W - boxW * 3) / 2;
  const boxY = cur.y;
  cur.ensure(boxH + 12);

  statBox(pdf, MARGIN,                   boxY, boxW, boxH, formatXP(stats.totalXP),                      'XP Total',     C.accent);
  statBox(pdf, MARGIN + boxW + boxGap,   boxY, boxW, boxH, stats.checkinStats.average.toFixed(1),         mood.label,     C.success);
  statBox(pdf, MARGIN + (boxW + boxGap) * 2, boxY, boxW, boxH, stats.checkinStats.total,                 'Check-ins',    C.info);
  cur.advance(boxH + 16);

  // ── CHECK-IN ───────────────────────────────────────────────────────────────
  if (checkins.length > 0) {
    sectionTitle(pdf, cur, 'Check-in da Equipe');

    for (const s of [5, 4, 3, 2, 1]) {
      const count = stats.checkinStats.distribution[s] || 0;
      const pct   = stats.checkinStats.total > 0 ? Math.round((count / stats.checkinStats.total) * 100) : 0;
      const emoji = getScoreEmoji(s);
      const barW  = LINE_W - 60;

      cur.ensure(14);
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...C.muted);
      pdf.text(`${emoji} ${s}`, MARGIN, cur.y);

      // barra de fundo
      pdf.setFillColor(...C.surface);
      pdf.roundedRect(MARGIN + 28, cur.y - 8, barW, 9, 2, 2, 'F');
      // barra preenchida
      if (pct > 0) {
        pdf.setFillColor(...C.accent);
        pdf.roundedRect(MARGIN + 28, cur.y - 8, barW * (pct / 100), 9, 2, 2, 'F');
      }
      pdf.setTextColor(...C.text);
      pdf.text(String(count), PAGE_W - MARGIN, cur.y, { align: 'right' });
      cur.advance(14);
    }

    const comments = checkins.filter((c) => c.comment);
    if (comments.length > 0) {
      cur.advance(4);
      paragraph(pdf, cur, 'Comentarios anonimos:', { color: C.muted, fontSize: 8.5, fontStyle: 'bold' });
      for (const c of comments) {
        bullet(pdf, cur, '"', `${c.comment}"`, { color: C.text, indent: 4 });
      }
    }
    cur.advance(6);
  }

  // ── TESOUROS ───────────────────────────────────────────────────────────────
  const treasureItems     = treasures.filter((t) => t.category === 'treasure');
  const recognitionItems  = treasures.filter((t) => t.category === 'recognition');
  const learningItems     = treasures.filter((t) => t.category === 'learning');

  sectionTitle(pdf, cur, 'Tesouros da Sprint');
  if (treasures.length === 0) {
    paragraph(pdf, cur, 'Nenhum tesouro registrado.', { color: C.muted });
  } else {
    if (treasureItems.length > 0) {
      paragraph(pdf, cur, 'O que funcionou bem:', { color: C.muted, fontStyle: 'bold', fontSize: 8.5 });
      for (const t of treasureItems) bullet(pdf, cur, '>', t.text, { color: C.text });
    }
    if (recognitionItems.length > 0) {
      cur.advance(4);
      paragraph(pdf, cur, 'Reconhecimentos:', { color: C.muted, fontStyle: 'bold', fontSize: 8.5 });
      for (const t of recognitionItems) bullet(pdf, cur, '>', t.text, { color: C.purple });
    }
    if (learningItems.length > 0) {
      cur.advance(4);
      paragraph(pdf, cur, 'Descobertas:', { color: C.muted, fontStyle: 'bold', fontSize: 8.5 });
      for (const t of learningItems) bullet(pdf, cur, '>', t.text, { color: C.info });
    }
  }
  cur.advance(6);

  // ── MONSTROS & SOLUÇÕES ────────────────────────────────────────────────────
  sectionTitle(pdf, cur, 'Monstros & Solucoes');
  if (monsters.length === 0) {
    paragraph(pdf, cur, 'Nenhum monstro identificado.', { color: C.muted });
  } else {
    for (const m of monsters) {
      const sols = solutions.filter((s) => s.monsterId === m.id);
      const tag  = m.selected ? ' [selecionado]' : '';
      const reactions = `  fire:${m.reactions.fire||0} eyes:${m.reactions.eyes||0} bulb:${m.reactions.bulb||0}`;
      bullet(pdf, cur, '!', `${m.text}${tag}${reactions}`, { color: C.danger, fontStyle: 'bold' });
      if (sols.length === 0) {
        paragraph(pdf, cur, 'Sem solucoes registradas.', { color: C.muted, indent: 20, fontSize: 8.5 });
      } else {
        for (const s of sols) {
          const label = stripEmoji(getStrategyLabel(s.strategy));
          bullet(pdf, cur, '-', `[${label}] ${s.text}  (votos: ${s.votes})`, { color: C.text, indent: 20 });
        }
      }
      cur.advance(4);
    }
  }
  cur.advance(6);

  // ── MISSÕES ────────────────────────────────────────────────────────────────
  sectionTitle(pdf, cur, 'Missoes para a Proxima Sprint');
  if (missions.length === 0) {
    paragraph(pdf, cur, 'Nenhuma missao definida.', { color: C.muted });
  } else {
    for (const m of missions) {
      bullet(pdf, cur, '>', m.title, { color: C.success, fontStyle: 'bold' });
      if (m.description) {
        paragraph(pdf, cur, m.description, { color: C.muted, indent: 20, fontSize: 8.5 });
      }
      const meta = [
        getPriorityLabel(m.priority),
        m.owner    ? `Responsavel: ${m.owner}`        : '',
        m.deadline ? `Prazo: ${formatDate(m.deadline)}` : '',
      ].filter(Boolean).join('  ·  ');
      if (meta) paragraph(pdf, cur, meta, { color: C.muted, indent: 20, fontSize: 8 });
      cur.advance(4);
    }
  }

  // ── RODAPÉ em todas as páginas ─────────────────────────────────────────────
  fillBackground();

  const numPages = pdf.getNumberOfPages();
  for (let p = 1; p <= numPages; p++) {
    pdf.setPage(p);
    const footerY = PAGE_H - 18;
    pdf.setDrawColor(...C.border);
    pdf.setLineWidth(0.5);
    pdf.line(MARGIN, footerY - 4, PAGE_W - MARGIN, footerY - 4);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.muted);
    pdf.text('Jornada da Sprint', MARGIN, footerY);
    pdf.text(`${p} / ${numPages}`, PAGE_W - MARGIN, footerY, { align: 'right' });
  }

  pdf.save(filename);
}
