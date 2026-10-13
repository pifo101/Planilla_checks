const PDFDocument = require('pdfkit');

const COLORS = {
  navy: '#102A43',
  navySoft: '#DCE6EF',
  gold: '#B38A3E',
  text: '#243B53',
  muted: '#627D98',
  border: '#BCCCDC',
  stripe: '#F5F8FA',
  white: '#FFFFFF',
};

const PAGE = {
  width: 792,
  height: 612,
  left: 30,
  right: 30,
  bottomContent: 564,
};

const TABLE_COLUMNS = [
  { key: 'numeroSolicitud', label: 'Solicitud', width: 60 },
  { key: 'nombreCliente', label: 'Cliente', width: 126 },
  { key: 'montoAprobado', label: 'Aprobado', width: 72, money: true },
  { key: 'montoCancelado', label: 'Cancelado', width: 68, money: true },
  { key: 'descuentos', label: 'Descuentos', width: 65, money: true },
  { key: 'montoCheque', label: 'Monto cheque', width: 72, money: true },
  { key: 'numeroCheque', label: 'No. cheque', width: 78 },
  { key: 'metodologia', label: 'Metodologia', width: 65 },
  { key: 'fechaHora', label: 'Fecha y hora', width: 126 },
];

const dateTimeFormatter = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Guatemala',
});

function text(value, fallback = '-') {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  return String(value).trim();
}

function moneyToCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = typeof value === 'number' ? value.toFixed(2) : String(value).trim();
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return 0;
  const cents = (BigInt(match[2]) * 100n) + BigInt((match[3] || '').padEnd(2, '0'));
  return Number(match[1] ? -cents : cents);
}

function formatMoney(cents) {
  return `Q ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : dateTimeFormatter.format(date);
}

function transferStatus(value) {
  if (value === true) return 'Trasladada';
  if (value === false) return 'No trasladada';
  return 'Pendiente';
}

function normalizePlanillaDocument(planilla) {
  if (!planilla || typeof planilla !== 'object') {
    throw new TypeError('Se requiere una planilla para generar el PDF.');
  }

  const solicitudes = Array.isArray(planilla.solicitudes) ? planilla.solicitudes : [];
  const rows = solicitudes.map((item) => ({
    numeroSolicitud: text(item.numeroSolicitud),
    nombreCliente: text(item.nombreCliente, 'Sin nombre'),
    montoAprobadoCents: moneyToCents(item.montoAprobado),
    montoCanceladoCents: moneyToCents(item.montoCancelado),
    descuentosCents: moneyToCents(item.descuentos),
    montoChequeCents: moneyToCents(item.montoCheque),
    numeroCheque: text(item.numeroCheque),
    metodologia: text(item.metodologia),
    fechaHora: formatDateTime(item.fechaProcesado || item.fechaExtraccion || item.fechaOperativa),
  }));

  const sum = (field) => rows.reduce((total, row) => total + row[field], 0);
  return {
    codigo: text(planilla.codigo, 'SIN-CODIGO'),
    agencia: text(planilla.agenciaNombre, 'Sin agencia'),
    numeroActa: text(planilla.numeroActa, 'Sin asignar'),
    fechaEnvio: formatDateTime(planilla.fechaEnvio),
    estadoTraslado: transferStatus(planilla.trasladado),
    fechaDecision: formatDateTime(planilla.fechaDecisionTraslado),
    usuarioDecision: text(planilla.decisionTrasladoUsuario),
    rows,
    totals: {
      aprobadoCents: sum('montoAprobadoCents'),
      canceladoCents: sum('montoCanceladoCents'),
      descuentosCents: sum('descuentosCents'),
      chequeCents: sum('montoChequeCents'),
      registros: rows.length,
    },
  };
}

function drawRule(doc, y, color = COLORS.gold) {
  doc.save().strokeColor(color).lineWidth(1).moveTo(PAGE.left, y).lineTo(PAGE.width - PAGE.right, y).stroke().restore();
}

function drawDocumentHeader(doc, data) {
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(20).text('ADICLA', PAGE.left, 28, { lineBreak: false });
  doc.fillColor(COLORS.navy).fontSize(13).text('PLANILLA DE CHEQUES', 500, 31, { width: 262, align: 'right', lineBreak: false });
  drawRule(doc, 55);

  const metadata = [
    ['Codigo de planilla', data.codigo],
    ['Agencia de origen', data.agencia],
    ['Numero de acta', data.numeroActa],
    ['Fecha y hora de envio', data.fechaEnvio],
    ['Solicitudes / integrantes', String(data.totals.registros)],
    ['Estado de traslado', data.estadoTraslado],
  ];
  metadata.forEach(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = PAGE.left + (column * 244);
    const y = 69 + (row * 36);
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6.5).text(label.toUpperCase(), x, y, { width: 226 });
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(9).text(value, x, y + 11, { width: 226, height: 13, ellipsis: true });
  });

  if (data.estadoTraslado !== 'Pendiente') {
    const decision = `Decision: ${data.fechaDecision} | Usuario: ${data.usuarioDecision}`;
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(decision, PAGE.left, 137, { width: 732, align: 'right', height: 10, ellipsis: true });
  }
}

function drawContinuationHeader(doc, data) {
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(12).text('ADICLA  |  PLANILLA DE CHEQUES', PAGE.left, 27, { lineBreak: false });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(`Planilla ${data.codigo}`, 500, 29, { width: 262, align: 'right', lineBreak: false });
  drawRule(doc, 48);
}

function drawTableHeader(doc, y) {
  let x = PAGE.left;
  doc.save().fillColor(COLORS.navy).rect(PAGE.left, y, 732, 25).fill();
  TABLE_COLUMNS.forEach((column) => {
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(6.5).text(column.label, x + 4, y + 7, {
      width: column.width - 8,
      height: 13,
      align: column.money ? 'right' : 'left',
      ellipsis: true,
    });
    x += column.width;
  });
  doc.restore();
  return y + 25;
}

function drawTableRow(doc, row, y, index) {
  const height = 29;
  let x = PAGE.left;
  if (index % 2 === 1) doc.save().fillColor(COLORS.stripe).rect(PAGE.left, y, 732, height).fill().restore();

  const values = {
    ...row,
    montoAprobado: formatMoney(row.montoAprobadoCents),
    montoCancelado: formatMoney(row.montoCanceladoCents),
    descuentos: formatMoney(row.descuentosCents),
    montoCheque: formatMoney(row.montoChequeCents),
  };
  TABLE_COLUMNS.forEach((column) => {
    doc.fillColor(COLORS.text).font(column.key === 'numeroSolicitud' ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.4).text(values[column.key], x + 4, y + 6, {
      width: column.width - 8,
      height: height - 10,
      align: column.money ? 'right' : 'left',
      ellipsis: true,
    });
    x += column.width;
  });
  doc.save().strokeColor(COLORS.border).lineWidth(0.35).moveTo(PAGE.left, y + height).lineTo(762, y + height).stroke().restore();
  return y + height;
}

function drawTotals(doc, data, y) {
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(10).text('TOTALES DE LA PLANILLA', PAGE.left, y);
  drawRule(doc, y + 16, COLORS.navySoft);
  const totals = [
    ['Total aprobado', formatMoney(data.totals.aprobadoCents)],
    ['Total cancelado', formatMoney(data.totals.canceladoCents)],
    ['Total descuentos', formatMoney(data.totals.descuentosCents)],
    ['Total monto cheque', formatMoney(data.totals.chequeCents)],
    ['Cantidad de registros', String(data.totals.registros)],
  ];
  totals.forEach(([label, value], index) => {
    const x = PAGE.left + (index * 146.4);
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6.3).text(label.toUpperCase(), x, y + 27, { width: 134 });
    doc.fillColor(index === 3 ? COLORS.navy : COLORS.text).font('Helvetica-Bold').fontSize(9).text(value, x, y + 40, { width: 134, height: 13, ellipsis: true });
  });
}

function addFooters(doc, data) {
  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    drawRule(doc, 578, COLORS.navySoft);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
      .text(`Planilla ${data.codigo}`, PAGE.left, 585, { width: 350, lineBreak: false })
      .text(`Pagina ${pageIndex + 1} de ${range.count}`, 412, 585, { width: 350, align: 'right', lineBreak: false });
  }
}

function renderPlanillaPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margins: { top: 28, right: PAGE.right, bottom: 15, left: PAGE.left },
      bufferPages: true,
      compress: true,
      info: {
        Title: `Planilla de cheques ${data.codigo}`,
        Author: 'ADICLA',
        Subject: 'Planilla de cheques',
        Creator: 'Planilla Checks',
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    drawDocumentHeader(doc, data);
    let y = drawTableHeader(doc, 153);
    data.rows.forEach((row, index) => {
      if (y + 29 > PAGE.bottomContent) {
        doc.addPage();
        drawContinuationHeader(doc, data);
        y = drawTableHeader(doc, 62);
      }
      y = drawTableRow(doc, row, y, index);
    });

    if (y + 70 > PAGE.bottomContent) {
      doc.addPage();
      drawContinuationHeader(doc, data);
      y = 76;
    } else {
      y += 16;
    }
    drawTotals(doc, data, y);
    addFooters(doc, data);
    doc.end();
  });
}

async function generatePlanillaPdf(planilla) {
  return renderPlanillaPdf(normalizePlanillaDocument(planilla));
}

module.exports = {
  formatMoney,
  generatePlanillaPdf,
  normalizePlanillaDocument,
  renderPlanillaPdf,
};
