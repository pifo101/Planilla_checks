const { DisbursementError } = require('../services/disbursement.service');
const { getDistribucionDesembolso } = require('../services/webservice.service');

const ERROR_MESSAGES = {
  INVALID_REQUEST_NUMBER: 'Ingresa un numero de solicitud valido.',
  EMPTY_DISTRIBUTION: 'No se encontraron datos de desembolso para la solicitud.',
  WEB_SERVICE_TIMEOUT: 'La consulta excedio el tiempo de espera. Intenta nuevamente.',
  WEB_SERVICE_UNAVAILABLE: 'No fue posible consultar el Web Service en este momento.',
  WEB_SERVICE_NOT_CONFIGURED: 'El Web Service no esta configurado.',
  INVALID_WEB_SERVICE_RESPONSE: 'El Web Service devolvio una respuesta invalida.',
  ONLY_LOAN_PAYMENT_UNCONFIRMED: 'La solicitud solo contiene un abono a prestamo y todavia no puede procesarse.',
  NON_FINAL_DISTRIBUTION: 'La solicitud contiene operaciones que todavia no estan finalizadas.',
  MULTIPLE_CLIENT_NAMES: 'La respuesta contiene nombres de cliente diferentes.',
  UNCONFIRMED_EXPENSE_FIELDS: 'La respuesta contiene gastos cuya regla esta pendiente de confirmacion.',
  GROUPED_AMOUNT_CALCULATION_UNCONFIRMED: 'La solicitud es grupal y su calculo esta pendiente de confirmacion.',
  UNSUPPORTED_DISTRIBUTION: 'La distribucion recibida todavia no esta soportada.',
};

async function getDistribution(req, res) {
  try {
    const data = await getDistribucionDesembolso(req.params.numeroSolicitud);

    if (!data.supported) {
      return res.status(422).json({
        success: false,
        error: {
          code: data.reason,
          message: ERROR_MESSAGES[data.reason] || ERROR_MESSAGES.UNSUPPORTED_DISTRIBUTION,
        },
        data: {
          cantidadCheques: data.cantidadCheques,
          metodologia: data.metodologia,
          warnings: data.warnings,
        },
      });
    }

    return res.json({
      success: true,
      data: {
        ...data,
        agenciaId: req.session.user.agenciaId || null,
        agencia: req.session.user.agenciaNombre || null,
      },
    });
  } catch (error) {
    if (error instanceof DisbursementError) {
      console.error(`Web Service [${error.code}]: ${error.message}`);
      return res.status(error.status).json({
        success: false,
        error: {
          code: error.code,
          message: ERROR_MESSAGES[error.code] || 'No fue posible obtener la informacion de la solicitud.',
        },
      });
    }

    console.error('Error inesperado al consultar el Web Service:', error.message);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'No fue posible obtener la informacion de la solicitud.',
      },
    });
  }
}

module.exports = {
  getDistribution,
};
