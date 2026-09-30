const actaService = require('../services/acta.service');

function sendError(error, res) {
  if (error instanceof actaService.ActaError) {
    if (error.status >= 500) console.error('Error de acta diaria:', error.cause?.message || error.message);
    return res.status(error.status).json({
      success: false,
      error: { code: error.code, message: error.message },
      ...(error.acta ? { data: { acta: error.acta } } : {}),
    });
  }
  console.error('Error inesperado de acta diaria:', error.message);
  return res.status(500).json({
    success: false,
    error: { code: 'DAILY_ACTA_UNAVAILABLE', message: 'No fue posible procesar el acta del dia.' },
  });
}

async function getDailyActa(req, res) {
  try {
    const current = await actaService.getCurrentActa();
    return res.json({ success: true, data: current });
  } catch (error) {
    return sendError(error, res);
  }
}

async function createDailyActa(req, res) {
  try {
    const acta = await actaService.createCurrentActa(req.session.user, req.body);
    return res.status(201).json({ success: true, data: { acta } });
  } catch (error) {
    return sendError(error, res);
  }
}

module.exports = { createDailyActa, getDailyActa };
