class DisbursementError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.name = 'DisbursementError';
    this.code = code;
    this.status = status;
  }
}

const EXPENSE_FIELDS = Array.from({ length: 9 }, (_, index) => `Gasto${String(index + 2).padStart(2, '0')}`);

function toCents(value, fieldName, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return 0;
    throw new DisbursementError(
      'INVALID_WEB_SERVICE_RESPONSE',
      `El campo ${fieldName} es obligatorio.`,
      502,
    );
  }

  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new DisbursementError(
      'INVALID_WEB_SERVICE_RESPONSE',
      `El campo ${fieldName} no contiene un monto valido.`,
      502,
    );
  }

  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new DisbursementError(
      'INVALID_WEB_SERVICE_RESPONSE',
      `El campo ${fieldName} debe ser un monto no negativo con hasta dos decimales.`,
      502,
    );
  }

  const [whole, decimal = ''] = text.split('.');
  const cents = (BigInt(whole) * 100n) + BigInt(decimal.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DisbursementError(
      'INVALID_WEB_SERVICE_RESPONSE',
      `El campo ${fieldName} excede el monto maximo permitido.`,
      502,
    );
  }

  return Number(cents);
}

function fromCents(value) {
  return value / 100;
}

function baseResult(distribuciones, fechaExtraccion) {
  const cheques = distribuciones.filter((item) => Number(item.FormaDesembolso) === 1);
  const abonos = distribuciones.filter((item) => Number(item.FormaDesembolso) === 3);
  const cantidadCheques = cheques.length;

  return {
    cliente: null,
    montoAprobado: null,
    montoCancelado: null,
    descuentos: null,
    montoCheque: null,
    numeroCredito: null,
    ordenPago: null,
    cantidadCheques,
    metodologia: cantidadCheques >= 2 ? 'GRUPAL' : cantidadCheques === 1 ? 'INDIVIDUAL' : null,
    fechaExtraccion,
    supported: false,
    reason: null,
    warnings: [],
    cheques,
    abonos,
  };
}

function unsupported(result, reason, warnings = []) {
  const { cheques, abonos, ...publicResult } = result;
  return { ...publicResult, reason, warnings };
}

function normalizeDisbursement(distribuciones, { fechaExtraccion = new Date() } = {}) {
  if (!Array.isArray(distribuciones)) {
    throw new DisbursementError(
      'INVALID_WEB_SERVICE_RESPONSE',
      'La respuesta del Web Service no es un arreglo.',
      502,
    );
  }

  if (distribuciones.length === 0) {
    throw new DisbursementError('EMPTY_DISTRIBUTION', 'La solicitud no contiene distribuciones.', 404);
  }

  if (distribuciones.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new DisbursementError(
      'INVALID_WEB_SERVICE_RESPONSE',
      'La respuesta contiene una distribucion invalida.',
      502,
    );
  }

  const result = baseResult(distribuciones, fechaExtraccion);
  const clientNames = [...new Set(
    distribuciones
      .map((item) => String(item.NombreEnCheque || '').trim())
      .filter(Boolean),
  )];

  if (clientNames.length !== 1) {
    return unsupported(
      result,
      'MULTIPLE_CLIENT_NAMES',
      ['No se pudo determinar un unico nombre de cliente en la distribucion.'],
    );
  }
  result.cliente = clientNames[0];

  if (distribuciones.some((item) => item.Ejecutado !== true)) {
    return unsupported(
      result,
      'NON_FINAL_DISTRIBUTION',
      ['Se detectaron operaciones que no estan marcadas como ejecutadas.'],
    );
  }

  const unconfirmedExpenses = [];
  for (const item of distribuciones) {
    for (const field of EXPENSE_FIELDS) {
      if (toCents(item[field], field) !== 0) {
        unconfirmedExpenses.push(field);
      }
    }
  }

  if (unconfirmedExpenses.length > 0) {
    return unsupported(
      result,
      'UNCONFIRMED_EXPENSE_FIELDS',
      [`Se recibieron valores en campos pendientes de confirmacion: ${[...new Set(unconfirmedExpenses)].join(', ')}.`],
    );
  }

  const knownItems = result.cheques.length + result.abonos.length;
  if (knownItems !== distribuciones.length) {
    return unsupported(
      result,
      'UNSUPPORTED_DISTRIBUTION',
      ['La respuesta contiene formas de desembolso que todavia no estan soportadas.'],
    );
  }

  if (result.cheques.length === 0 && result.abonos.length > 0) {
    return unsupported(
      result,
      'ONLY_LOAN_PAYMENT_UNCONFIRMED',
      ['La distribucion contiene solamente abonos a prestamo.'],
    );
  }

  if (result.abonos.some((item) => toCents(item.Gasto01, 'Gasto01') !== 0)) {
    return unsupported(
      result,
      'UNCONFIRMED_EXPENSE_FIELDS',
      ['Se recibio Gasto01 fuera de una emision de cheque y su uso no esta confirmado.'],
    );
  }

  if (result.cheques.length >= 2) {
    return unsupported(
      result,
      'GROUPED_AMOUNT_CALCULATION_UNCONFIRMED',
      ['La metodologia es grupal, pero el calculo de sus montos esta pendiente de confirmacion.'],
    );
  }

  if (result.cheques.length !== 1 || result.abonos.length > 1) {
    return unsupported(result, 'UNSUPPORTED_DISTRIBUTION');
  }

  const cheque = result.cheques[0];
  const abono = result.abonos[0];
  const montoChequeCents = toCents(cheque.ValorNeto, 'ValorNeto', { required: true });
  const descuentosCents = toCents(cheque.Gasto01, 'Gasto01', { required: true });
  const montoCanceladoCents = abono
    ? toCents(abono.ValorNeto, 'ValorNeto', { required: true })
    : 0;

  const { cheques, abonos, ...normalized } = result;
  return {
    ...normalized,
    montoAprobado: fromCents(montoCanceladoCents + descuentosCents + montoChequeCents),
    montoCancelado: fromCents(montoCanceladoCents),
    descuentos: fromCents(descuentosCents),
    montoCheque: fromCents(montoChequeCents),
    numeroCredito: abono ? String(abono.NumeroCredito || '').trim() || null : null,
    ordenPago: cheque.OrdenPago ?? null,
    supported: true,
  };
}

module.exports = {
  DisbursementError,
  normalizeDisbursement,
};
