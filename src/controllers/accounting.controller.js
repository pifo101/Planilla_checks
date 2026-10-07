const planillaService = require('../services/planilla.service');
const { safeReturnTo } = require('../utils/navigation');

function accountingListUrl(path, values) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

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
    errorCode: 500,
  });
}

async function listReceivedPlanillas(req, res) {
  try {
    const history = await planillaService.listAccountingPlanillas(req.session.user, req.query);
    res.set('Cache-Control', 'no-store');
    const returnTo = accountingListUrl('/contabilidad/planillas', {
      agencia: history.selectedAgencyId,
      page: history.page,
    });
    const decisionReturnTo = accountingListUrl('/contabilidad/planillas', {
      agencia: history.selectedAgencyId,
    });
    const message = req.session.accountingFeedback || null;
    delete req.session.accountingFeedback;
    return res.render('accounting/received-planillas', {
      pageTitle: 'Pendientes de traslado',
      ...history,
      returnTo,
      decisionReturnTo,
      message,
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
      returnTo: safeReturnTo(
        req.query?.returnTo,
        ['/contabilidad/planillas', '/contabilidad/historial'],
        planilla.trasladado == null ? '/contabilidad/planillas' : '/contabilidad/historial',
      ),
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
    const returnTo = safeReturnTo(
      req.body.returnTo,
      ['/contabilidad/planillas'],
      '/contabilidad/planillas',
    );
    req.session.accountingFeedback = decision.trasladado
      ? 'La planilla fue marcada como trasladada.'
      : 'La planilla fue marcada como no trasladada.';
    return res.redirect(303, returnTo);
  } catch (error) {
    return renderAccountingError(error, req, res);
  }
}

async function listTransferHistory(req, res) {
  try {
    const history = await planillaService.listAccountingTransferHistory(req.session.user, req.query);
    res.set('Cache-Control', 'no-store');
    const returnTo = accountingListUrl('/contabilidad/historial', {
      fecha: history.selectedDate,
      agencia: history.selectedAgencyId,
      resultado: history.selectedResult,
      page: history.page,
    });
    return res.render('accounting/transfer-history', {
      pageTitle: 'Historial de traslados',
      ...history,
      returnTo,
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
