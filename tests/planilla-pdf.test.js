const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const preview = require('../scripts/preview-ui');
const {
  generatePlanillaPdf,
  normalizePlanillaDocument,
  PDF_CONTEXTS,
} = require('../src/services/planilla-pdf.service');

async function loadPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true }).promise;
}

async function pdfText(pdf) {
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  return pages;
}

async function pdfItems(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items;
}

function makePlanilla(rowCount) {
  return {
    codigo: `PLA-PRUEBA-${String(rowCount).padStart(3, '0')}-CODIGO-LARGO-INSTITUCIONAL`,
    agenciaNombre: 'Agencia de Demostracion San Cristobal Verapaz',
    numeroActa: 'ACTA-DEMOSTRACION-2026-EXTENSA',
    fechaEnvio: new Date('2026-10-09T11:30:00-06:00'),
    trasladado: rowCount % 2 === 0,
    fechaDecisionTraslado: new Date('2026-10-09T15:30:00-06:00'),
    decisionTrasladoUsuario: 'Contabilidad Demostracion',
    solicitudes: Array.from({ length: rowCount }, (_, index) => ({
      numeroSolicitud: `SOL-${String(index + 1).padStart(4, '0')}`,
      nombreCliente: `Maria Jose Chacon Alvarez con nombre largo numero ${index + 1}`,
      montoAprobado: '1234.56',
      montoCancelado: '200.00',
      descuentos: '34.56',
      montoCheque: '1000.00',
      numeroCheque: `CHK-${String(index + 1).padStart(6, '0')}`,
      metodologia: index % 2 ? 'GRUPAL' : 'INDIVIDUAL',
      fechaExtraccion: new Date(`2026-10-09T${String(8 + (index % 9)).padStart(2, '0')}:15:00-06:00`),
    })),
  };
}

async function withServer(run) {
  const server = await new Promise((resolve) => {
    const instance = preview.createPreviewApp().listen(0, preview.HOST, () => resolve(instance));
  });
  try {
    await run(server);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('normalization derives exact cent totals from included rows', () => {
  const normalized = normalizePlanillaDocument(makePlanilla(5));
  assert.deepEqual(normalized.totals, {
    aprobadoCents: 617280,
    canceladoCents: 100000,
    descuentosCents: 17280,
    chequeCents: 500000,
    registros: 5,
  });
  assert.equal(normalized.rows[0].montoAprobadoCents, 123456);
  assert.equal(
    normalized.rows[0].montoAprobadoCents,
    normalized.rows[0].montoCanceladoCents + normalized.rows[0].descuentosCents + normalized.rows[0].montoChequeCents,
  );
});

test('PDFs for 1, 5, 20, and 50 rows are valid landscape Letter documents', async () => {
  const expectedPages = new Map([[1, 1], [5, 1], [20, 2], [50, 4]]);
  for (const rowCount of expectedPages.keys()) {
    for (const context of Object.values(PDF_CONTEXTS)) {
      const buffer = await generatePlanillaPdf(makePlanilla(rowCount), { context });
      assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-', `${context}, ${rowCount} rows`);
      assert.ok(buffer.length > 2000, `${context}, ${rowCount} rows`);

      const pdf = await loadPdf(buffer);
      assert.equal(pdf.numPages, expectedPages.get(rowCount), `${context}, ${rowCount} rows`);
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        assert.equal(viewport.width, 792, `${context}, ${rowCount} rows, page ${pageNumber}`);
        assert.equal(viewport.height, 612, `${context}, ${rowCount} rows, page ${pageNumber}`);
      }
    }
  }
});

test('multi-page PDF repeats headers, keeps one final total, and exposes page numbers', async () => {
  const pdf = await loadPdf(await generatePlanillaPdf(makePlanilla(50), { context: PDF_CONTEXTS.ACCOUNTING }));
  const pages = await pdfText(pdf);
  pages.forEach((content, index) => {
    assert.match(content, /PLANILLA DE CHEQUES/, `page ${index + 1}`);
    assert.match(content, /Solicitud/, `page ${index + 1}`);
    assert.match(content, new RegExp(`Pagina ${index + 1} de ${pages.length}`), `page ${index + 1}`);
  });
  assert.equal(pages.filter((content) => content.includes('TOTALES DE LA PLANILLA')).length, 1);
  assert.match(pages.at(-1), /Q 61,728\.00/);
  assert.match(pages.at(-1), /Q 10,000\.00/);
  assert.match(pages.at(-1), /Q 1,728\.00/);
  assert.match(pages.at(-1), /Q 50,000\.00/);
});

test('PDF preserves accented and long values and tolerates incomplete optional data', async () => {
  const source = makePlanilla(1);
  source.codigo = 'PLA-CODIGO-MUY-LARGO-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789';
  source.solicitudes[0].nombreCliente = 'Maria Jose Chacon Alvarez de la Pena';
  source.solicitudes[0].metodologia = null;
  source.solicitudes[0].numeroCheque = null;
  source.solicitudes[0].fechaExtraccion = null;
  const normalized = normalizePlanillaDocument(source);
  assert.equal(normalized.rows[0].numeroCheque, '-');
  assert.equal(normalized.rows[0].metodologia, '-');
  assert.equal(normalized.rows[0].fechaHora, '-');

  const pdf = await loadPdf(await generatePlanillaPdf(source, { context: PDF_CONTEXTS.ACCOUNTING }));
  const content = (await pdfText(pdf)).join(' ');
  assert.match(content, /Maria Jose Chacon Alvarez de la Pena/);
  assert.match(content, /PLANILLA DE CHEQUES/);
  assert.match(content, /Q 1,234\.56/);
});

test('PDF grupal conserva cada integrante y sus importes', async () => {
  const source = makePlanilla(2);
  source.solicitudes = [
    { ...source.solicitudes[0], numeroSolicitud: '90001', miembroId: 'M-01', nombreCliente: 'Integrante Uno', metodologia: 'GRUPAL' },
    { ...source.solicitudes[1], numeroSolicitud: '90001', miembroId: 'M-02', nombreCliente: 'Integrante Dos', metodologia: 'GRUPAL' },
  ];
  const normalized = normalizePlanillaDocument(source);
  assert.equal(normalized.rows.length, 2);
  assert.equal(normalized.totals.chequeCents, 200000);

  const pdf = await loadPdf(await generatePlanillaPdf(source, { context: PDF_CONTEXTS.ASSISTANT }));
  const content = (await pdfText(pdf)).join(' ');
  assert.match(content, /Integrante Uno/);
  assert.match(content, /Integrante Dos/);
  assert.match(content, /GRUPAL/);
});

test('firma del jefe queda centrada abajo solo en ASISTENTE y pagina cuando es necesario', async () => {
  const source = makePlanilla(26);
  const assistantPdf = await loadPdf(await generatePlanillaPdf(source, { context: PDF_CONTEXTS.ASSISTANT }));
  const accountingPdf = await loadPdf(await generatePlanillaPdf(source, { context: PDF_CONTEXTS.ACCOUNTING }));
  const assistantPages = await pdfText(assistantPdf);
  const accountingPages = await pdfText(accountingPdf);

  assert.equal(assistantPdf.numPages, accountingPdf.numPages + 1);
  assert.equal(assistantPages.filter((content) => content.includes('Jefe de Agencia')).length, 1);
  assert.match(assistantPages.at(-1), /TOTALES DE LA PLANILLA/);
  assert.match(assistantPages.at(-1), /Jefe de Agencia/);
  assert.doesNotMatch(accountingPages.join(' '), /Jefe de Agencia/);

  const signature = (await pdfItems(assistantPdf, assistantPdf.numPages))
    .find((item) => item.str === 'Jefe de Agencia');
  assert.ok(signature);
  assert.ok(Math.abs((signature.transform[4] + (signature.width / 2)) - 396) < 1);
  assert.ok(signature.transform[5] < 110, 'la firma debe permanecer en la zona inferior');
});

test('trazabilidad de traslado usa la decision historica en ambos contextos', async () => {
  const transferred = preview.demoData.allPlanillas.find((item) => item.codigo === 'PLA-DEMO-GRUPAL-005');
  const notTransferred = {
    ...makePlanilla(1),
    trasladado: false,
    fechaDecisionTraslado: new Date('2026-10-09T15:25:00-06:00'),
    decisionTrasladoUsuario: 'Contabilidad Demo',
  };
  const pending = {
    ...makePlanilla(1),
    trasladado: null,
    fechaDecisionTraslado: null,
    decisionTrasladoUsuario: null,
  };

  for (const context of Object.values(PDF_CONTEXTS)) {
    const transferredText = (await pdfText(await loadPdf(
      await generatePlanillaPdf(transferred, { context }),
    ))).join(' ');
    assert.match(transferredText, /Trasladado por: Contabilidad Demo \| Fecha: 09\/10\/2026, 3:05 p\. m\./);
    assert.doesNotMatch(transferredText, /Decision:|Usuario:/);

    const notTransferredText = (await pdfText(await loadPdf(
      await generatePlanillaPdf(notTransferred, { context }),
    ))).join(' ');
    assert.match(notTransferredText, /Marcada como no trasladada por: Contabilidad Demo \| Fecha: 09\/10\/2026, 3:25 p\. m\./);

    const pendingText = (await pdfText(await loadPdf(
      await generatePlanillaPdf(pending, { context }),
    ))).join(' ');
    assert.match(pendingText, /Pendiente/);
    assert.doesNotMatch(pendingText, /Trasladado por:|Marcada como no trasladada por:|Decision:|Usuario:/);
  }
});

test('generacion PDF rechaza contextos ausentes o manipulados', async () => {
  await assert.rejects(generatePlanillaPdf(makePlanilla(1)), TypeError);
  await assert.rejects(generatePlanillaPdf(makePlanilla(1), { context: 'ADMIN' }), TypeError);
  await assert.rejects(generatePlanillaPdf(makePlanilla(1), { context: 'ASISTENTE&firma=false' }), TypeError);
});

test('preview PDF routes enforce context, agency, official status, and safe headers', async () => {
  await withServer(async (server) => {
    const baseUrl = `http://${preview.HOST}:${server.address().port}`;
    const assistant = await fetch(`${baseUrl}/asistente/planillas/9901/pdf`);
    assert.equal(assistant.status, 200);
    assert.equal(assistant.headers.get('content-type'), 'application/pdf');
    assert.equal(assistant.headers.get('content-disposition'), 'attachment; filename="planilla-PLA-DEMO-001.pdf"');
    assert.match(assistant.headers.get('cache-control'), /no-store/);
    assert.doesNotMatch(assistant.headers.get('content-disposition'), /[\r\n]/);
    assert.equal(Buffer.from(await assistant.arrayBuffer()).subarray(0, 5).toString('ascii'), '%PDF-');

    assert.equal((await fetch(`${baseUrl}/asistente/planillas/9902/pdf`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/asistente/planillas/999999/pdf`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/9902/pdf`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/999999/pdf`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/admin/planillas/9901/pdf`)).status, 404);

    const draft = { ...preview.demoData.allPlanillas[0], id: 9998, estado: 'BORRADOR', fechaEnvio: null };
    preview.demoData.allPlanillas.push(draft);
    try {
      assert.equal((await fetch(`${baseUrl}/asistente/planillas/9998/pdf`)).status, 404);
      assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/9998/pdf`)).status, 404);
    } finally {
      preview.demoData.allPlanillas.pop();
    }
  });
});

test('download controls appear only in assistant and accounting preview contexts', async () => {
  await withServer(async (server) => {
    const baseUrl = `http://${preview.HOST}:${server.address().port}`;
    for (const route of ['/asistente/planillas', '/asistente/planillas/9901', '/contabilidad/planillas', '/contabilidad/planillas/9901', '/contabilidad/historial']) {
      const html = await (await fetch(`${baseUrl}${route}`)).text();
      assert.match(html, /Descargar PDF/, route);
    }
    const adminHtml = await (await fetch(`${baseUrl}/dashboard`)).text();
    assert.doesNotMatch(adminHtml, /Descargar PDF|\/pdf/, 'ADMIN');
  });
});

test('PDF generation is isolated from SQL, Web Service, browser identity, and file writes', () => {
  const serviceSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'planilla-pdf.service.js'), 'utf8');
  const previewSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'preview-ui.js'), 'utf8');
  assert.doesNotMatch(serviceSource, /msnodesqlv8|mssql|repositories|webservice|sessionStorage/i);
  assert.doesNotMatch(serviceSource, /writeFile|createWriteStream|appendFile|require\(['"](?:node:)?fs/i);
  assert.doesNotMatch(previewSource, /msnodesqlv8|mssql|repositories|webservice|sessionStorage/i);
  assert.match(previewSource, /require\(['"]\.\.\/src\/services\/planilla-pdf\.service['"]\)/);

  const loadedModules = Object.keys(require.cache).join('\n');
  assert.doesNotMatch(loadedModules, /msnodesqlv8|[\\/]mssql[\\/]|src[\\/]config[\\/]database/);
});
