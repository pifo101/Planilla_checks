const crypto = require('node:crypto');
const planillaRepository = require('../repositories/planilla.repository');
const actaService = require('./acta.service');
const { getOperationalDate, getOperationalDateRange, toSecondPrecision } = require('../utils/operational-date');
const {
  AvailabilityValidationError,
  validateCheckNumber,
  validateRequestNumber,
} = require('./availability.service');
const {
  SubmissionTokenError,
  verifySubmissionToken,
} = require('./planilla-token.service');

const MAX_SOLICITUDES = 100;
const HISTORY_PAGE_SIZE = 20;
const MAX_HISTORY_PAGE = Math.floor(2_147_483_647 / HISTORY_PAGE_SIZE) + 1;
const DUPLICATE_SQL_NUMBERS = new Set([2601, 2627]);

class PlanillaError extends Error {
  constructor(code, message, status = 400, options = {}) {
    super(message, options);
    this.name = 'PlanillaError';
    this.code = code;
    this.status = status;
  }
}

function requireText(value, fieldName, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new PlanillaError(
      'INVALID_REQUEST_ITEM',
      `El campo ${fieldName} es obligatorio y admite hasta ${maxLength} caracteres.`,
    );
  }
  return value.trim();
}

function requireCents(value, fieldName) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PlanillaError(
      'INVALID_AMOUNT',
      `El campo ${fieldName} debe expresarse como centavos enteros no negativos.`,
    );
  }
  return value;
}

function addCents(...values) {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new PlanillaError('INVALID_AMOUNT', 'La suma de los montos excede el rango seguro.');
    }
  }
  return total;
}

function centsToAmount(cents) {
  const amount = Number(`${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`);
  if (!Number.isFinite(amount) || Math.round(amount * 100) !== cents) {
    throw new PlanillaError('INVALID_AMOUNT', 'Un monto no puede representarse con precision de centavos.');
  }
  return amount;
}

function normalizeIdentifier(value, validator) {
  try {
    return validator(value);
  } catch (error) {
    if (error instanceof AvailabilityValidationError) {
      throw new PlanillaError(error.code, error.message);
    }
    throw error;
  }
}

function normalizeSolicitud(solicitud, userId, now) {
  if (!solicitud || typeof solicitud !== 'object' || Array.isArray(solicitud)) {
    throw new PlanillaError('INVALID_REQUEST_ITEM', 'Cada solicitud debe ser un objeto valido.');
  }

  const numeroSolicitud = normalizeIdentifier(solicitud.numeroSolicitud, validateRequestNumber);
  const numeroCheque = normalizeIdentifier(solicitud.numeroCheque, validateCheckNumber);
  let snapshot;
  try {
    snapshot = verifySubmissionToken(solicitud.submissionToken, userId, { now: () => now });
  } catch (error) {
    if (error instanceof SubmissionTokenError) {
      throw new PlanillaError('INVALID_SUBMISSION_TOKEN', 'Consulta nuevamente la solicitud antes de enviarla.');
    }
    throw error;
  }
  if (snapshot.numeroSolicitud !== numeroSolicitud) {
    throw new PlanillaError('INVALID_SUBMISSION_TOKEN', 'El token no corresponde a la solicitud enviada.');
  }

  const nombreCliente = requireText(snapshot.cliente, 'cliente', 200);
  const metodologia = requireText(snapshot.metodologia, 'metodologia', 100);
  if (!['INDIVIDUAL', 'GRUPAL'].includes(metodologia)) {
    throw new PlanillaError(
      'UNSUPPORTED_METHODOLOGY',
      'La metodologia de la solicitud no esta soportada.',
      422,
    );
  }
  const miembroId = metodologia === 'GRUPAL'
    ? requireText(snapshot.miembroId, 'miembroId', 100)
    : null;
  if (metodologia === 'GRUPAL' && String(solicitud.miembroId || '').trim() !== miembroId) {
    throw new PlanillaError('INVALID_SUBMISSION_TOKEN', 'El token no corresponde al miembro enviado.');
  }

  const montoAprobadoCents = requireCents(snapshot.montoAprobadoCentavos, 'montoAprobadoCentavos');
  const montoCanceladoCents = requireCents(snapshot.montoCanceladoCentavos, 'montoCanceladoCentavos');
  const descuentosCents = requireCents(snapshot.descuentosCentavos, 'descuentosCentavos');
  const montoChequeCents = requireCents(snapshot.montoChequeCentavos, 'montoChequeCentavos');
  const calculatedApprovedCents = addCents(montoCanceladoCents, descuentosCents, montoChequeCents);

  if (montoAprobadoCents !== calculatedApprovedCents) {
    throw new PlanillaError(
      'INCONSISTENT_AMOUNTS',
      'El monto aprobado no coincide con el monto cancelado, descuentos y monto del cheque.',
    );
  }

  return {
    numeroSolicitud,
    ...(metodologia === 'GRUPAL' ? {
      miembroId,
      cantidadMiembros: snapshot.cantidadMiembros,
      grupoFingerprint: requireText(snapshot.grupoFingerprint, 'grupoFingerprint', 64),
    } : {}),
    nombreCliente,
    numeroCheque,
    metodologia,
    montoAprobado: centsToAmount(montoAprobadoCents),
    montoCancelado: centsToAmount(montoCanceladoCents),
    descuentos: centsToAmount(descuentosCents),
    montoCheque: centsToAmount(montoChequeCents),
  };
}

function validateSubmission(submission, { userId, now } = {}) {
  if (!submission || typeof submission !== 'object' || Array.isArray(submission)) {
    throw new PlanillaError('INVALID_BODY', 'El cuerpo de la peticion debe ser un objeto JSON valido.');
  }
  if (!Object.hasOwn(submission, 'solicitudes') || !Array.isArray(submission.solicitudes)) {
    throw new PlanillaError('INVALID_REQUESTS', 'El campo solicitudes debe ser un arreglo.');
  }
  if (submission.solicitudes.length === 0) {
    throw new PlanillaError('EMPTY_PLANILLA', 'La planilla debe contener al menos una solicitud.');
  }
  if (submission.solicitudes.length > MAX_SOLICITUDES) {
    throw new PlanillaError(
      'PLANILLA_TOO_LARGE',
      `Una planilla admite como maximo ${MAX_SOLICITUDES} solicitudes por envio.`,
      413,
    );
  }

  const solicitudes = submission.solicitudes.map((solicitud) => normalizeSolicitud(solicitud, userId, now));
  const requestNumbers = new Set();
  const memberKeys = new Set();
  const checkNumbers = new Set();
  for (const solicitud of solicitudes) {
    const requestSeen = requestNumbers.has(solicitud.numeroSolicitud);
    if (requestSeen && solicitud.metodologia !== 'GRUPAL') {
      throw new PlanillaError(
        'DUPLICATE_REQUEST_IN_SUBMISSION',
        'La peticion contiene un numero de solicitud repetido.',
        409,
      );
    }
    requestNumbers.add(solicitud.numeroSolicitud);

    const memberKey = `${solicitud.numeroSolicitud}\u0000${solicitud.miembroId || ''}`;
    if (memberKeys.has(memberKey)) {
      throw new PlanillaError('DUPLICATE_GROUP_MEMBER_IN_SUBMISSION', 'La peticion contiene un miembro grupal repetido.', 409);
    }
    memberKeys.add(memberKey);

    const checkKey = solicitud.numeroCheque.toUpperCase();
    if (checkNumbers.has(checkKey)) {
      throw new PlanillaError(
        'DUPLICATE_CHECK_IN_SUBMISSION',
        'La peticion contiene un numero de cheque repetido.',
        409,
      );
    }
    checkNumbers.add(checkKey);
  }

  for (const numeroSolicitud of requestNumbers) {
    const group = solicitudes.filter((item) => item.numeroSolicitud === numeroSolicitud);
    if (group.some((item) => item.metodologia === 'GRUPAL')) {
      const expected = group[0].cantidadMiembros;
      const fingerprint = group[0].grupoFingerprint;
      if (group.some((item) => item.metodologia !== 'GRUPAL' || item.cantidadMiembros !== expected)
          || group.some((item) => item.grupoFingerprint !== fingerprint)
          || group.length !== expected) {
        throw new PlanillaError(
          'INCOMPLETE_GROUP_SUBMISSION',
          'La solicitud grupal debe enviarse con todos sus miembros en una sola planilla.',
          422,
        );
      }
    }
  }
  return solicitudes;
}

function sqlErrorDetails(error) {
  const errors = [error, ...(Array.isArray(error?.precedingErrors) ? error.precedingErrors : [])];
  return {
    numbers: errors.map((item) => Number(item?.number)).filter(Number.isFinite),
    message: errors.map((item) => String(item?.message || '')).join(' '),
  };
}

function duplicateKind(error) {
  const details = sqlErrorDetails(error);
  if (!details.numbers.some((number) => DUPLICATE_SQL_NUMBERS.has(number))) return null;
  if (/UQ_solicitudes_numero_solicitud/i.test(details.message)) return 'REQUEST';
  if (/UQ_solicitudes_numero_solicitud_miembro/i.test(details.message)) return 'REQUEST';
  if (/UQ_solicitudes_numero_cheque/i.test(details.message)) return 'CHECK';
  if (/UQ_planillas_codigo/i.test(details.message)) return 'CODE';
  return 'UNKNOWN';
}

function persistenceError(error) {
  const duplicate = duplicateKind(error);
  if (duplicate === 'REQUEST') {
    return new PlanillaError('REQUEST_ALREADY_USED', 'Una solicitud ya fue utilizada en otra planilla.', 409);
  }
  if (duplicate === 'CHECK') {
    return new PlanillaError('CHECK_ALREADY_USED', 'Un numero de cheque ya fue utilizado en otra planilla.', 409);
  }
  if (duplicate) {
    return new PlanillaError(
      'PLANILLA_CONFLICT',
      'La planilla contiene datos que fueron registrados por otra peticion.',
      409,
    );
  }
  return new PlanillaError(
    'PLANILLA_PERSISTENCE_FAILED',
    'No fue posible guardar la planilla en este momento.',
    500,
    { cause: error },
  );
}

function generatePlanillaCode() {
  return `PLN-${crypto.randomUUID()}`;
}

async function ensureAvailable(solicitudes) {
  try {
    for (const solicitud of solicitudes) {
      const usage = await planillaRepository.findSolicitudUsage(
        solicitud.numeroSolicitud,
        solicitud.numeroCheque,
      );
      if (usage.solicitudUtilizada) {
        throw new PlanillaError(
          'REQUEST_ALREADY_USED',
          `La solicitud ${solicitud.numeroSolicitud} ya fue utilizada en otra planilla.`,
          409,
        );
      }
      if (usage.chequeUtilizado) {
        throw new PlanillaError(
          'CHECK_ALREADY_USED',
          `El numero de cheque ${solicitud.numeroCheque} ya fue utilizado en otra planilla.`,
          409,
        );
      }
    }
  } catch (error) {
    if (error instanceof PlanillaError) throw error;
    throw persistenceError(error);
  }
}

async function createPlanilla(user, submission, options = {}) {
  if (user?.rol !== 'ASISTENTE' || !Number.isSafeInteger(user.id) || user.id <= 0
      || !Number.isSafeInteger(user.agenciaId) || user.agenciaId <= 0) {
    throw new PlanillaError(
      'ASSISTANT_AGENCY_REQUIRED',
      'El usuario no tiene una agencia habilitada para enviar planillas.',
      403,
    );
  }

  let now;
  try {
    now = toSecondPrecision(options.now ? options.now() : new Date());
  } catch {
    throw new PlanillaError('PLANILLA_PERSISTENCE_FAILED', 'No fue posible generar la fecha de envio.', 500);
  }
  const solicitudes = validateSubmission(submission, { userId: user.id, now });
  await ensureAvailable(solicitudes);

  let currentActa;
  try {
    currentActa = await actaService.getCurrentActa({ now: () => now });
  } catch (error) {
    throw new PlanillaError(
      'PLANILLA_PERSISTENCE_FAILED',
      'No fue posible consultar el acta del dia.',
      500,
      { cause: error },
    );
  }
  if (!currentActa.acta) {
    throw new PlanillaError(
      'DAILY_ACTA_REQUIRED',
      'Debe registrarse el acta del dia antes de enviar nuevas planillas.',
      409,
    );
  }

  const codeFactory = options.generateCode || generatePlanillaCode;
  const snapshots = solicitudes.map((solicitud) => ({
    ...solicitud,
    fechaExtraccion: now,
    estado: 'PENDIENTE',
  }));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await planillaRepository.createWithSolicitudes({
        codigo: codeFactory(),
        agenciaId: user.agenciaId,
        usuarioId: user.id,
        fechaEnvio: now,
        estado: 'ENVIADA',
        numeroActa: currentActa.acta.numeroActa,
      }, snapshots);
    } catch (error) {
      if (duplicateKind(error) === 'CODE' && attempt < 2) continue;
      throw persistenceError(error);
    }
  }
  throw new PlanillaError('PLANILLA_PERSISTENCE_FAILED', 'No fue posible generar el codigo de la planilla.', 500);
}

function requireAssistantAgency(user) {
  if (user?.rol !== 'ASISTENTE' || !Number.isSafeInteger(user.agenciaId) || user.agenciaId <= 0) {
    throw new PlanillaError(
      'ASSISTANT_AGENCY_REQUIRED',
      'El usuario no tiene una agencia habilitada para consultar planillas.',
      403,
    );
  }
  return user.agenciaId;
}

function normalizeHistoryDate(value, now = new Date()) {
  let selectedDate;
  try {
    selectedDate = value == null || value === '' ? getOperationalDate(now) : value;
  } catch {
    throw new PlanillaError('INVALID_HISTORY_DATE', 'Selecciona una fecha valida.');
  }
  if (typeof selectedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
      || selectedDate < '0001-01-01') {
    throw new PlanillaError('INVALID_HISTORY_DATE', 'Selecciona una fecha valida.');
  }

  let range;
  try {
    range = getOperationalDateRange(selectedDate);
  } catch {
    throw new PlanillaError('INVALID_HISTORY_DATE', 'Selecciona una fecha valida.');
  }
  return {
    selectedDate,
    ...range,
  };
}

function normalizePage(value) {
  if (value == null || value === '') return 1;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new PlanillaError('INVALID_HISTORY_PAGE', 'La pagina solicitada no es valida.');
  }
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page <= 0 || page > MAX_HISTORY_PAGE) {
    throw new PlanillaError('INVALID_HISTORY_PAGE', 'La pagina solicitada no es valida.');
  }
  return page;
}

function normalizePlanillaId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new PlanillaError('INVALID_PLANILLA_ID', 'La planilla solicitada no es valida.');
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new PlanillaError('INVALID_PLANILLA_ID', 'La planilla solicitada no es valida.');
  }
  return id;
}

async function listSentPlanillas(user, filters = {}, options = {}) {
  const agenciaId = requireAssistantAgency(user);
  const date = normalizeHistoryDate(filters.fecha, options.now ? options.now() : new Date());
  const page = normalizePage(filters.page);
  const result = await planillaRepository.findSentByAgencyAndDate(
    agenciaId,
    date.startDate,
    date.endDate,
    page,
    HISTORY_PAGE_SIZE,
  );
  const totalPages = Math.max(1, Math.ceil(result.total / HISTORY_PAGE_SIZE));

  if (page > totalPages) {
    throw new PlanillaError('INVALID_HISTORY_PAGE', 'La pagina solicitada no es valida.');
  }
  return { ...result, page, pageSize: HISTORY_PAGE_SIZE, totalPages, selectedDate: date.selectedDate };
}

async function getSentPlanillaDetail(user, rawId) {
  const agenciaId = requireAssistantAgency(user);
  const id = normalizePlanillaId(rawId);
  return planillaRepository.findDetailForAgency(id, agenciaId);
}

module.exports = {
  HISTORY_PAGE_SIZE,
  MAX_SOLICITUDES,
  PlanillaError,
  createPlanilla,
  generatePlanillaCode,
  getSentPlanillaDetail,
  listSentPlanillas,
  normalizeHistoryDate,
  normalizePage,
  normalizePlanillaId,
  validateSubmission,
};
