const config = require('../config');
const { DisbursementError, normalizeDisbursement } = require('./disbursement.service');

const REQUEST_NUMBER_PATTERN = /^\d{1,30}$/;

function validateRequestNumber(numeroSolicitud) {
  const normalized = String(numeroSolicitud || '').trim();

  if (!REQUEST_NUMBER_PATTERN.test(normalized)) {
    throw new DisbursementError(
      'INVALID_REQUEST_NUMBER',
      'El numero de solicitud debe contener unicamente entre 1 y 30 digitos.',
      400,
    );
  }

  return normalized;
}

async function getDistribucionDesembolso(numeroSolicitud, options = {}) {
  const requestNumber = validateRequestNumber(numeroSolicitud);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = String(options.baseUrl || config.webServiceBaseUrl || '').replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs || config.webServiceTimeoutMs;
  const now = options.now || (() => new Date());

  if (!baseUrl) {
    throw new DisbursementError(
      'WEB_SERVICE_NOT_CONFIGURED',
      'El Web Service no esta configurado.',
      503,
    );
  }

  if (typeof fetchImpl !== 'function') {
    throw new DisbursementError('WEB_SERVICE_UNAVAILABLE', 'El cliente HTTP no esta disponible.', 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${baseUrl}/RecuperarDistribucionDesembolso/${encodeURIComponent(requestNumber)}`;

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new DisbursementError(
        'WEB_SERVICE_UNAVAILABLE',
        'El Web Service respondio con un estado no exitoso.',
        502,
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new DisbursementError(
        'INVALID_WEB_SERVICE_RESPONSE',
        'El Web Service devolvio JSON invalido.',
        502,
      );
    }

    return normalizeDisbursement(payload, { fechaExtraccion: now() });
  } catch (error) {
    if (error instanceof DisbursementError) {
      throw error;
    }

    if (controller.signal.aborted || error.name === 'AbortError') {
      throw new DisbursementError(
        'WEB_SERVICE_TIMEOUT',
        'El Web Service excedio el tiempo limite de respuesta.',
        504,
      );
    }

    throw new DisbursementError(
      'WEB_SERVICE_UNAVAILABLE',
      'No fue posible conectar con el Web Service.',
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getDistribucionDesembolso,
  validateRequestNumber,
};
