const {
  AvailabilityValidationError,
  getAvailability,
} = require('../services/availability.service');

async function checkAvailability(req, res) {
  try {
    const data = await getAvailability(req.params.numeroSolicitud, req.query.numeroCheque);
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof AvailabilityValidationError) {
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    console.error('Error al consultar disponibilidad:', error.message);
    return res.status(500).json({
      success: false,
      error: {
        code: 'AVAILABILITY_CHECK_FAILED',
        message: 'No fue posible comprobar la disponibilidad en este momento.',
      },
    });
  }
}

module.exports = { checkAvailability };
