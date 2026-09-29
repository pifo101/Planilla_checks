const { DisbursementError } = require('../services/disbursement.service');
const { getDistribucionDesembolso } = require('../services/webservice.service');
const { createGroupFingerprint, createSubmissionToken } = require('../services/planilla-token.service');

const ERROR_MESSAGES = {
  INVALID_REQUEST_NUMBER: 'Ingresa un numero de solicitud valido.',
  EMPTY_DISTRIBUTION: 'No se encontraron datos de desembolso para la solicitud.',
  WEB_SERVICE_TIMEOUT: 'La consulta excedio el tiempo de espera. Intenta nuevamente.',
  WEB_SERVICE_UNAVAILABLE: 'No fue posible consultar el Web Service en este momento.',
  WEB_SERVICE_NOT_CONFIGURED: 'El Web Service no esta configurado.',
  INVALID_WEB_SERVICE_RESPONSE: 'El Web Service devolvio una respuesta invalida.',
  ONLY_LOAN_PAYMENT: 'La solicitud no procede porque no contiene una emision de cheque valida.',
  DISBURSEMENT_NOT_EXECUTED: 'El desembolso no fue ejecutado correctamente y la solicitud no puede agregarse.',
  INVALID_CLIENT_NAME: 'La emision de cheque no contiene un nombre de cliente valido.',
  LOAN_PAYMENT_WITHOUT_CHECK: 'Existe un abono sin una emision de cheque correspondiente para la misma persona.',
  LOAN_PAYMENT_NAME_AMBIGUOUS: 'Existen varios abonos para la misma persona y no pueden asociarse de forma inequivoca.',
  GROUPED_MEMBER_IDENTITY_UNCONFIRMED: 'No fue posible identificar de forma unica a todos los miembros del grupo.',
  GROUPED_MEMBER_DATA_INVALID: 'La informacion de uno o mas miembros del grupo esta incompleta.',
  GROUP_MEMBER_NAME_AMBIGUOUS: 'Dos o mas miembros tienen el mismo nombre de cheque y los abonos no pueden asociarse de forma inequivoca.',
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
          miembros: data.miembros || [],
          warnings: data.warnings,
        },
      });
    }

    const responseData = {
      ...data,
      agenciaId: req.session.user.agenciaId || null,
      agencia: req.session.user.agenciaNombre || null,
    };
    if (data.metodologia === 'GRUPAL') {
      const grupoFingerprint = createGroupFingerprint(
        data.miembros.map((miembro) => miembro.miembroId),
        data.fechaExtraccion,
      );
      responseData.miembros = data.miembros.map((miembro) => ({
        ...miembro,
        submissionToken: createSubmissionToken(
          req.session.user.id,
          req.params.numeroSolicitud,
          {
            ...miembro,
            metodologia: 'GRUPAL',
            cantidadMiembros: data.miembros.length,
            grupoFingerprint,
          },
        ),
      }));
    } else {
      responseData.submissionToken = createSubmissionToken(req.session.user.id, req.params.numeroSolicitud, data);
    }

    return res.json({
      success: true,
      data: responseData,
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
