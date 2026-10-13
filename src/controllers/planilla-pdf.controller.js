const planillaService = require('../services/planilla.service');
const { generatePlanillaPdf, PDF_CONTEXTS } = require('../services/planilla-pdf.service');

function safePdfFilename(code) {
  const safeCode = String(code || 'sin-codigo').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
  return `planilla-${safeCode || 'sin-codigo'}.pdf`;
}

function preventCaching(res) {
  res.set({
    'Cache-Control': 'no-store, private, max-age=0',
    Pragma: 'no-cache',
  });
}

async function sendPlanillaPdf(res, planilla, context) {
  const pdf = await generatePlanillaPdf(planilla, { context });
  preventCaching(res);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${safePdfFilename(planilla.codigo)}"`,
    'Content-Length': String(pdf.length),
    'X-Content-Type-Options': 'nosniff',
  });
  return res.send(pdf);
}

function renderDownloadError(error, res) {
  if (error instanceof planillaService.PlanillaError) {
    const errorView = error.status === 403 || error.status >= 500 ? '500' : '404';
    return res.status(error.status).render(errorView, {
      pageTitle: error.status === 403 ? 'Acceso denegado' : 'Consulta no valida',
      errorMessage: error.message,
      errorCode: error.status,
    });
  }
  console.error(error);
  return res.status(500).render('500', {
    pageTitle: 'Error del servidor',
    errorMessage: 'No fue posible generar el PDF en este momento.',
    errorCode: 500,
  });
}

async function downloadAssistantPlanilla(req, res) {
  preventCaching(res);
  try {
    const planilla = await planillaService.getSentPlanillaDetail(req.session.user, req.params.id);
    if (!planilla) {
      return res.status(404).render('404', {
        pageTitle: 'Planilla no encontrada',
        errorMessage: 'La planilla no existe o no pertenece a tu agencia.',
        errorCode: 404,
      });
    }
    return sendPlanillaPdf(res, planilla, PDF_CONTEXTS.ASSISTANT);
  } catch (error) {
    return renderDownloadError(error, res);
  }
}

async function downloadAccountingPlanilla(req, res) {
  preventCaching(res);
  try {
    const planilla = await planillaService.getAccountingPlanillaDetail(req.session.user, req.params.id);
    if (!planilla) {
      return res.status(404).render('404', {
        pageTitle: 'Planilla no encontrada',
        errorMessage: 'La planilla solicitada no existe.',
        errorCode: 404,
      });
    }
    return sendPlanillaPdf(res, planilla, PDF_CONTEXTS.ACCOUNTING);
  } catch (error) {
    return renderDownloadError(error, res);
  }
}

module.exports = {
  downloadAccountingPlanilla,
  downloadAssistantPlanilla,
  safePdfFilename,
};
