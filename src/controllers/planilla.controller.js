const planillaService = require('../services/planilla.service');
const { PlanillaError } = planillaService;

async function submitPlanilla(req, res) {
  try {
    const created = await planillaService.createPlanilla(req.session.user, req.body);
    return res.status(201).json({
      success: true,
      data: {
        planilla: {
          id: created.id,
          codigo: created.codigo,
          estado: created.estado,
        },
      },
    });
  } catch (error) {
    if (error instanceof PlanillaError) {
      if (error.status >= 500) {
        console.error('Error al persistir planilla:', error.cause?.message || error.message);
      }
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    console.error('Error inesperado al enviar planilla:', error.message);
    return res.status(500).json({
      success: false,
      error: {
        code: 'PLANILLA_PERSISTENCE_FAILED',
        message: 'No fue posible guardar la planilla en este momento.',
      },
    });
  }
}

module.exports = { submitPlanilla };
