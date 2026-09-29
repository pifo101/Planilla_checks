class DisbursementError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.name = 'DisbursementError';
    this.code = code;
    this.status = status;
  }
}

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

  const numericCents = Number(cents);
  if (!Number.isFinite(numericCents) || !Number.isInteger(numericCents) || !Number.isSafeInteger(numericCents)) {
    throw new DisbursementError(
      'INVALID_WEB_SERVICE_RESPONSE',
      `El campo ${fieldName} excede el monto maximo permitido.`,
      502,
    );
  }

  return numericCents;
}

function fromCents(value) {
  const amount = value / 100;
  if (toCents(amount, 'monto normalizado', { required: true }) !== value) {
    throw new DisbursementError(
      'INVALID_WEB_SERVICE_RESPONSE',
      'El monto no puede representarse con precision de centavos.',
      502,
    );
  }
  return amount;
}

function addCents(...values) {
  let total = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || !Number.isSafeInteger(value)) {
      throw new DisbursementError(
        'INVALID_WEB_SERVICE_RESPONSE',
        'La respuesta contiene un monto fuera del rango seguro.',
        502,
      );
    }
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new DisbursementError(
        'INVALID_WEB_SERVICE_RESPONSE',
        'La suma de los montos excede el rango seguro.',
        502,
      );
    }
  }
  return total;
}

function baseResult(distribuciones, fechaExtraccion) {
  const cheques = distribuciones.filter((item) => item.FormaDesembolso === 1);
  const abonos = distribuciones.filter((item) => item.FormaDesembolso === 3);
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

function memberId(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || !String(value).trim()) return null;
  const normalized = String(value).trim();
  return normalized.length <= 100 ? normalized : null;
}

function groupedResult(result) {
  const ids = result.cheques.map((cheque) => memberId(cheque.ID));
  const uniqueIds = new Set(ids);
  const hasConfirmedIdentity = ids.every(Boolean) && uniqueIds.size === ids.length;
  const hasLoanPayments = result.abonos.length > 0;
  const hasCompleteMemberData = result.cheques.every((cheque) => String(cheque.NombreEnCheque || '').trim());
  const reason = !hasConfirmedIdentity
    ? 'GROUPED_MEMBER_IDENTITY_UNCONFIRMED'
    : !hasCompleteMemberData ? 'GROUPED_MEMBER_DATA_INVALID'
    : hasLoanPayments ? 'GROUPED_LOAN_PAYMENT_ASSOCIATION_UNCONFIRMED' : null;

  const miembros = result.cheques.map((cheque, index) => {
    const cliente = String(cheque.NombreEnCheque || '').trim();
    const calculado = hasConfirmedIdentity && !hasLoanPayments && Boolean(cliente);
    if (!calculado) {
      return {
        miembroId: ids[index],
        cliente: cliente || null,
        montoAprobado: null,
        montoCancelado: null,
        descuentos: null,
        montoCheque: null,
        ordenPago: cheque.OrdenPago ?? null,
        calculado: false,
      };
    }

    const descuentosCents = toCents(cheque.Gasto01, 'Gasto01', { required: true });
    const montoChequeCents = toCents(cheque.ValorNeto, 'ValorNeto', { required: true });
    return {
      miembroId: ids[index],
      cliente,
      montoAprobado: fromCents(addCents(descuentosCents, montoChequeCents)),
      montoCancelado: 0,
      descuentos: fromCents(descuentosCents),
      montoCheque: fromCents(montoChequeCents),
      ordenPago: cheque.OrdenPago ?? null,
      calculado: true,
    };
  });

  const { cheques, abonos, ...normalized } = result;
  return {
    ...normalized,
    miembros,
    supported: !reason && miembros.every((miembro) => miembro.calculado),
    reason,
    warnings: reason === 'GROUPED_MEMBER_IDENTITY_UNCONFIRMED'
      ? ['Cada emision grupal necesita un ID unico para identificar al miembro.']
      : reason === 'GROUPED_MEMBER_DATA_INVALID'
        ? ['Cada emision grupal necesita un nombre de cliente.']
      : reason === 'GROUPED_LOAN_PAYMENT_ASSOCIATION_UNCONFIRMED'
        ? ['No existe una relacion confirmada entre los abonos y las emisiones del grupo.']
        : [],
  };
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

  if (distribuciones.some((item) => typeof item.FormaDesembolso !== 'number' || !Number.isInteger(item.FormaDesembolso))) {
    throw new DisbursementError(
      'INVALID_WEB_SERVICE_RESPONSE',
      'La respuesta contiene un tipo invalido para FormaDesembolso.',
      502,
    );
  }

  const result = baseResult(distribuciones, fechaExtraccion);

  if (distribuciones.some((item) => item.Ejecutado !== true)) {
    return unsupported(
      result,
      'NON_FINAL_DISTRIBUTION',
      ['Se detectaron operaciones que no estan marcadas como ejecutadas.'],
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

  if (result.cheques.length >= 2) return groupedResult(result);

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

  if (result.cheques.length === 0 && result.abonos.length > 0) {
    return unsupported(
      result,
      'ONLY_LOAN_PAYMENT_UNCONFIRMED',
      ['La distribucion contiene solamente abonos a prestamo.'],
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
    montoAprobado: fromCents(addCents(montoCanceladoCents, descuentosCents, montoChequeCents)),
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
