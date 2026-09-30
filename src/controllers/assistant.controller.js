const planillaService = require('../services/planilla.service');
const actaService = require('../services/acta.service');

async function showNewPlanilla(req, res) {
  try {
    const dailyActa = await actaService.getCurrentActa();
    res.set('Cache-Control', 'no-store');
    return res.render('assistant/new-planilla', {
      pageTitle: 'Nueva planilla',
      dailyActa,
    });
  } catch (error) {
    console.error('Error al consultar acta diaria:', error.cause?.message || error.message);
    return res.status(500).render('500', {
      pageTitle: 'Error del servidor',
      errorMessage: 'No fue posible consultar el acta del dia en este momento.',
    });
  }
}

function renderHistoryError(error, res) {
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
    errorMessage: 'No fue posible consultar las planillas en este momento.',
  });
}

async function listSentPlanillas(req, res) {
  try {
    const history = await planillaService.listSentPlanillas(req.session.user, req.query);
    res.set('Cache-Control', 'no-store');
    return res.render('assistant/sent-planillas', {
      pageTitle: 'Planillas enviadas',
      ...history,
    });
  } catch (error) {
    return renderHistoryError(error, res);
  }
}

async function showSentPlanilla(req, res) {
  try {
    const planilla = await planillaService.getSentPlanillaDetail(req.session.user, req.params.id);
    if (!planilla) {
      return res.status(404).render('404', {
        pageTitle: 'Planilla no encontrada',
        errorMessage: 'La planilla no existe o no pertenece a tu agencia.',
        errorCode: 404,
      });
    }
    res.set('Cache-Control', 'no-store');
    return res.render('assistant/planilla-detail', {
      pageTitle: `Planilla ${planilla.codigo}`,
      planilla,
    });
  } catch (error) {
    return renderHistoryError(error, res);
  }
}

module.exports = {
  showNewPlanilla,
  listSentPlanillas,
  showSentPlanilla,
};
