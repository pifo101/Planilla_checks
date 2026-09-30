const actaRepository = require('../repositories/acta.repository');
const { getOperationalDate } = require('../utils/operational-date');

const MAX_ACTA_NUMBER_LENGTH = 50;
const DUPLICATE_SQL_NUMBERS = new Set([2601, 2627]);
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u;

class ActaError extends Error {
  constructor(code, message, status = 400, options = {}) {
    super(message, options);
    this.name = 'ActaError';
    this.code = code;
    this.status = status;
    this.acta = options.acta || null;
  }
}

function normalizeActaNumber(value) {
  if (typeof value !== 'string') {
    throw new ActaError('INVALID_ACTA_NUMBER', 'El numero de acta es obligatorio y debe ser texto.');
  }
  const numeroActa = value.trim();
  if (!numeroActa || numeroActa.length > MAX_ACTA_NUMBER_LENGTH || CONTROL_CHARACTERS.test(numeroActa)) {
    throw new ActaError(
      'INVALID_ACTA_NUMBER',
      `El numero de acta debe contener entre 1 y ${MAX_ACTA_NUMBER_LENGTH} caracteres sin caracteres de control.`,
    );
  }
  return numeroActa;
}

function currentDate(options = {}) {
  const now = options.now ? options.now() : new Date();
  try {
    return getOperationalDate(now);
  } catch (error) {
    throw new ActaError('DAILY_ACTA_UNAVAILABLE', 'No fue posible determinar la fecha operativa.', 500, { cause: error });
  }
}

async function getCurrentActa(options = {}) {
  const fecha = currentDate(options);
  try {
    return { fecha, acta: await actaRepository.findByDate(fecha) };
  } catch (error) {
    throw new ActaError('DAILY_ACTA_UNAVAILABLE', 'No fue posible consultar el acta del dia.', 500, { cause: error });
  }
}

function isUniqueDateConflict(error) {
  const errors = [error, ...(Array.isArray(error?.precedingErrors) ? error.precedingErrors : [])];
  return errors.some((item) => DUPLICATE_SQL_NUMBERS.has(Number(item?.number)))
    && errors.some((item) => /UQ_actas_diarias_fecha/i.test(String(item?.message || '')));
}

async function createCurrentActa(user, body, options = {}) {
  if (user?.rol !== 'ASISTENTE' || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new ActaError('FORBIDDEN', 'Solo un asistente activo puede registrar el acta del dia.', 403);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ActaError('INVALID_ACTA_NUMBER', 'El numero de acta es obligatorio y debe ser texto.');
  }
  const fecha = currentDate(options);
  const numeroActa = normalizeActaNumber(body.numeroActa);

  try {
    const existing = await actaRepository.findByDate(fecha);
    if (existing) {
      throw new ActaError(
        'DAILY_ACTA_ALREADY_EXISTS',
        'Otra persona ya establecio el acta del dia. Debe utilizarse el acta vigente.',
        409,
        { acta: existing },
      );
    }
    return await actaRepository.create({ fecha, numeroActa, usuarioId: user.id });
  } catch (error) {
    if (error instanceof ActaError) throw error;
    if (isUniqueDateConflict(error)) {
      let existing = null;
      try {
        existing = await actaRepository.findByDate(fecha);
      } catch {
        // The controlled conflict is still safe even if the follow-up read fails.
      }
      throw new ActaError(
        'DAILY_ACTA_ALREADY_EXISTS',
        'Otra persona ya establecio el acta del dia. Debe utilizarse el acta vigente.',
        409,
        { acta: existing },
      );
    }
    throw new ActaError('DAILY_ACTA_UNAVAILABLE', 'No fue posible registrar el acta del dia.', 500, { cause: error });
  }
}

module.exports = {
  ActaError,
  MAX_ACTA_NUMBER_LENGTH,
  createCurrentActa,
  getCurrentActa,
  normalizeActaNumber,
};
