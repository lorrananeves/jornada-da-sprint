/**
 * Export Service — PDF + PNG via jsPDF + html2canvas
 */

/**
 * Capture a DOM element as a canvas
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
 */
export async function exportAsPNG(el, filename = 'jornada-sprint-relatorio.png') {
  const canvas = await captureElement(el);
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Download the report element as a PDF
 */
export async function exportAsPDF(el, filename = 'jornada-sprint-relatorio.pdf') {
  const { jsPDF } = await import('jspdf');
  const canvas = await captureElement(el);
  const imgData = canvas.toDataURL('image/png');

  const pdfWidth = 210; // A4 width in mm
  const pxToMm = pdfWidth / canvas.width;
  const pdfHeight = canvas.height * pxToMm;

  const pdf = new jsPDF({
    orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
    unit: 'mm',
    format: [pdfWidth, pdfHeight],
  });

  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save(filename);
}
