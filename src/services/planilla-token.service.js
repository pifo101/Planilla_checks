const crypto = require('node:crypto');
const config = require('../config');

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

class SubmissionTokenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SubmissionTokenError';
  }
}

function toCents(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new SubmissionTokenError('Monto invalido para el envio.');
  const [whole, decimals = ''] = text.split('.');
  const cents = (BigInt(whole) * 100n) + BigInt(decimals.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new SubmissionTokenError('Monto fuera del rango seguro.');
  return Number(cents);
}

function signature(encodedPayload, secret = config.sessionSecret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function createSubmissionToken(userId, numeroSolicitud, distribution, options = {}) {
  const now = options.now ? options.now() : new Date();
  const payload = {
    version: 1,
    userId,
    expiresAt: now.getTime() + TOKEN_TTL_MS,
    numeroSolicitud,
    cliente: distribution.cliente,
    metodologia: distribution.metodologia,
    montoAprobadoCentavos: toCents(distribution.montoAprobado),
    montoCanceladoCentavos: toCents(distribution.montoCancelado),
    descuentosCentavos: toCents(distribution.descuentos),
    montoChequeCentavos: toCents(distribution.montoCheque),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${signature(encodedPayload, options.secret)}`;
}

function verifySubmissionToken(token, userId, options = {}) {
  if (typeof token !== 'string' || token.length > 4096) {
    throw new SubmissionTokenError('Token de solicitud invalido.');
  }
  const [encodedPayload, receivedSignature, extra] = token.split('.');
  if (!encodedPayload || !receivedSignature || extra) {
    throw new SubmissionTokenError('Token de solicitud invalido.');
  }

  const expectedSignature = signature(encodedPayload, options.secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(receivedSignature);
  if (expectedBuffer.length !== receivedBuffer.length
      || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new SubmissionTokenError('Token de solicitud invalido.');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch (error) {
    throw new SubmissionTokenError('Token de solicitud invalido.');
  }
  const now = options.now ? options.now() : new Date();
  if (payload.version !== 1 || payload.userId !== userId
      || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt < now.getTime()) {
    throw new SubmissionTokenError('El token de la solicitud vencio o no pertenece al usuario autenticado.');
  }
  return payload;
}

module.exports = {
  SubmissionTokenError,
  TOKEN_TTL_MS,
  createSubmissionToken,
  verifySubmissionToken,
};
