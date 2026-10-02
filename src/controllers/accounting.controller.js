const planillaService = require('../services/planilla.service');

function renderAccountingError(error, req, res) {
  if (error instanceof planillaService.PlanillaError) {
    if (typeof req.is === 'function' && req.is('application/json')) {
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
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

async function listReceivedPlanillas(req, res) {
  try {
    const history = await planillaService.listAccountingPlanillas(req.session.user, req.query);
    res.set('Cache-Control', 'no-store');
    return res.render('accounting/received-planillas', {
      pageTitle: 'Pendientes de traslado',
      ...history,
    });
  } catch (error) {
    return renderAccountingError(error, req, res);
  }
}

async function showReceivedPlanilla(req, res) {
  try {
    const planilla = await planillaService.getAccountingPlanillaDetail(req.session.user, req.params.id);
    if (!planilla) {
      return res.status(404).render('404', {
        pageTitle: 'Planilla no encontrada',
        errorMessage: 'La planilla solicitada no existe.',
        errorCode: 404,
      });
    }
    res.set('Cache-Control', 'no-store');
    return res.render('accounting/planilla-detail', {
      pageTitle: `Planilla ${planilla.codigo}`,
      planilla,
    });
  } catch (error) {
    return renderAccountingError(error, req, res);
  }
}

async function decideTransfer(req, res) {
  try {
    const decision = await planillaService.decideAccountingTransfer(
      req.session.user,
      req.params.id,
      req.body,
    );
    res.set('Cache-Control', 'no-store');
    if (typeof req.is === 'function' && req.is('application/json')) {
      return res.json({ success: true, data: { decision } });
    }
    return res.redirect(303, '/contabilidad/planillas');
  } catch (error) {
    return renderAccountingError(error, req, res);
  }
}

async function listTransferHistory(req, res) {
  try {
    const history = await planillaService.listAccountingTransferHistory(req.session.user, req.query);
    res.set('Cache-Control', 'no-store');
    return res.render('accounting/transfer-history', {
      pageTitle: 'Historial de traslados',
      ...history,
    });
  } catch (error) {
    return renderAccountingError(error, req, res);
  }
}

module.exports = {
  decideTransfer,
  listReceivedPlanillas,
  listTransferHistory,
  showReceivedPlanilla,
};
