const crypto = require('node:crypto');
const config = require('../config');
const { toSecondPrecision } = require('../utils/operational-date');

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

function normalizeExtractionTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  try {
    return toSecondPrecision(date).toISOString();
  } catch {
    throw new SubmissionTokenError('Fecha de extraccion invalida para el envio.');
  }
}

function createGroupFingerprint(memberIds, fechaExtraccion) {
  if (!Array.isArray(memberIds) || memberIds.length < 2) {
    throw new SubmissionTokenError('Snapshot grupal invalido.');
  }
  const extractionTime = normalizeExtractionTimestamp(fechaExtraccion);
  const identities = memberIds.map((value) => String(value || '').trim()).sort();
  if (!extractionTime || identities.some((value) => !value)) {
    throw new SubmissionTokenError('Snapshot grupal invalido.');
  }
  return crypto.createHash('sha256')
    .update(JSON.stringify({ extractionTime, identities }))
    .digest('base64url');
}

function createSubmissionToken(userId, numeroSolicitud, distribution, options = {}) {
  const now = options.now ? options.now() : new Date();
  const payload = {
    version: distribution.metodologia === 'GRUPAL' ? 2 : 1,
    userId,
    expiresAt: now.getTime() + TOKEN_TTL_MS,
    numeroSolicitud,
    fechaExtraccion: normalizeExtractionTimestamp(distribution.fechaExtraccion),
    cliente: distribution.cliente,
    metodologia: distribution.metodologia,
    montoAprobadoCentavos: toCents(distribution.montoAprobado),
    montoCanceladoCentavos: toCents(distribution.montoCancelado),
    descuentosCentavos: toCents(distribution.descuentos),
    montoChequeCentavos: toCents(distribution.montoCheque),
  };
  if (payload.version === 2) {
    payload.miembroId = String(distribution.miembroId || '').trim();
    payload.cantidadMiembros = distribution.cantidadMiembros;
    payload.grupoFingerprint = String(distribution.grupoFingerprint || '').trim();
    if (!payload.miembroId || payload.miembroId.length > 100
        || !Number.isSafeInteger(payload.cantidadMiembros) || payload.cantidadMiembros < 2
        || !/^[A-Za-z0-9_-]{43}$/.test(payload.grupoFingerprint)) {
      throw new SubmissionTokenError('Identidad grupal invalida para el envio.');
    }
  }
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
  if (![1, 2].includes(payload.version) || payload.userId !== userId
      || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt < now.getTime()) {
    throw new SubmissionTokenError('El token de la solicitud vencio o no pertenece al usuario autenticado.');
  }
  if (typeof payload.fechaExtraccion !== 'string'
      || normalizeExtractionTimestamp(payload.fechaExtraccion) !== payload.fechaExtraccion) {
    throw new SubmissionTokenError('Token de solicitud invalido.');
  }
  return payload;
}

module.exports = {
  SubmissionTokenError,
  TOKEN_TTL_MS,
  createSubmissionToken,
  createGroupFingerprint,
  verifySubmissionToken,
};
